function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

export default {
  async fetch(request) {
    return new Response('Session Durable Object', { status: 200 });
  }
};

export class SessionHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.connections = new Map();
    this.presence = new Map();
    this.data = {
      sessionId: null,
      campaignId: null,
      mapId: null,
      hostId: null,
      name: null,
      status: 'idle',
      revealedRegions: [],
      markers: {},
      metadata: {},
      lastUpdated: new Date().toISOString(),
    };
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get('state');
      if (stored) {
        this.data = stored;
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocket(request, url);
    }

    switch (url.pathname) {
      case '/setup':
        return this.handleSetup(request);
      case '/state':
        return jsonResponse(await this.exportState());
      case '/restore':
        return this.handleRestore(request);
      case '/end':
        return this.handleEnd();
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  async handleSetup(request) {
    const body = await request.json();
    this.data.sessionId = body.sessionId;
    this.data.campaignId = body.campaignId;
    this.data.mapId = body.mapId;
    this.data.hostId = body.hostId;
    this.data.name = body.name;
    this.data.status = 'active';
    this.data.revealedRegions = [];
    this.data.markers = {};
    this.data.metadata = body.metadata || {};
    this.data.lastUpdated = new Date().toISOString();
    await this.persist();
    await this.broadcast({ type: 'state', payload: await this.exportState() });
    return jsonResponse({ success: true });
  }

  async handleRestore(request) {
    const body = await request.json();
    if (body?.state) {
      this.data = {
        ...this.data,
        ...body.state,
        status: body.clone ? 'active' : (body.state.status || 'active'),
        lastUpdated: new Date().toISOString(),
      };
      if (!Array.isArray(this.data.revealedRegions)) {
        this.data.revealedRegions = [];
      }
      if (!this.data.markers || typeof this.data.markers !== 'object') {
        this.data.markers = {};
      }
      await this.persist();
      await this.broadcast({ type: 'state', payload: await this.exportState() });
    }
    return jsonResponse({ success: true });
  }

  async handleEnd() {
    this.data.status = 'ended';
    this.data.lastUpdated = new Date().toISOString();
    await this.persist();
    await this.broadcast({ type: 'state', payload: await this.exportState() });
    this.closeAll(1000, 'Session ended');
    return jsonResponse({ success: true });
  }

  async handleWebSocket(request, url) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const connectionId = crypto.randomUUID();
    const role = url.searchParams.get('role') || 'player';
    const name = url.searchParams.get('name') || (role === 'dm' ? 'Dungeon Master' : 'Player');

    const meta = { id: connectionId, role, name, connectedAt: new Date().toISOString() };
    this.connections.set(connectionId, server);
    this.presence.set(connectionId, meta);

    server.addEventListener('message', (event) => {
      this.handleMessage(connectionId, server, event).catch((err) => {
        console.error('Message handling error', err);
        try {
          server.send(JSON.stringify({ type: 'error', error: 'Internal error' }));
        } catch (sendErr) {
          console.error('Failed to send error message', sendErr);
        }
      });
    });

    const cleanup = () => {
      this.connections.delete(connectionId);
      this.presence.delete(connectionId);
      this.broadcastPlayers();
    };

    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.send(JSON.stringify({ type: 'state', payload: await this.exportState() }));
    this.broadcastPlayers();

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleMessage(connectionId, socket, event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
      return;
    }

    switch (data.type) {
      case 'join':
        if (data.name) {
          const meta = this.presence.get(connectionId);
          if (meta) {
            meta.name = data.name;
            meta.role = data.role || meta.role;
            this.presence.set(connectionId, meta);
            this.broadcastPlayers();
          }
        }
        socket.send(JSON.stringify({ type: 'state', payload: await this.exportState() }));
        break;
      case 'revealRegions':
        if (Array.isArray(data.regionIds)) {
          const newIds = data.regionIds.filter((id) => !this.data.revealedRegions.includes(id));
          if (newIds.length) {
            this.data.revealedRegions = [...this.data.revealedRegions, ...newIds];
            this.data.lastUpdated = new Date().toISOString();
            await this.persist();
            await this.broadcast({ type: 'regionsRevealed', payload: { regionIds: newIds } });
          }
        }
        break;
      case 'hideRegions':
        if (Array.isArray(data.regionIds)) {
          const removed = this.data.revealedRegions.filter((id) => !data.regionIds.includes(id));
          if (removed.length !== this.data.revealedRegions.length) {
            this.data.revealedRegions = this.data.revealedRegions.filter((id) => !data.regionIds.includes(id));
            this.data.lastUpdated = new Date().toISOString();
            await this.persist();
            await this.broadcast({ type: 'regionsHidden', payload: { regionIds: data.regionIds } });
          }
        }
        break;
      case 'placeMarker':
        if (data.marker && typeof data.marker === 'object') {
          const markerId = data.marker.id || crypto.randomUUID();
          this.data.markers[markerId] = {
            id: markerId,
            label: data.marker.label || 'Marker',
            x: data.marker.x ?? 0,
            y: data.marker.y ?? 0,
            color: data.marker.color || '#facc15',
            iconKey: data.marker.iconKey || null,
            notes: data.marker.notes || null,
          };
          this.data.lastUpdated = new Date().toISOString();
          await this.persist();
          await this.broadcast({ type: 'markerAdded', payload: { marker: this.data.markers[markerId] } });
        }
        break;
      case 'updateMarker':
        if (data.marker && data.marker.id && this.data.markers[data.marker.id]) {
          const marker = this.data.markers[data.marker.id];
          this.data.markers[data.marker.id] = {
            ...marker,
            ...data.marker,
          };
          this.data.lastUpdated = new Date().toISOString();
          await this.persist();
          await this.broadcast({ type: 'markerUpdated', payload: { marker: this.data.markers[data.marker.id] } });
        }
        break;
      case 'removeMarker':
        if (data.markerId && this.data.markers[data.markerId]) {
          const marker = this.data.markers[data.markerId];
          delete this.data.markers[data.markerId];
          this.data.lastUpdated = new Date().toISOString();
          await this.persist();
          await this.broadcast({ type: 'markerRemoved', payload: { markerId: data.markerId, marker } });
        }
        break;
      case 'ping':
        socket.send(JSON.stringify({ type: 'pong', payload: { now: Date.now() } }));
        break;
      default:
        socket.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
    }
  }

  async exportState() {
    return {
      sessionId: this.data.sessionId,
      campaignId: this.data.campaignId,
      mapId: this.data.mapId,
      hostId: this.data.hostId,
      name: this.data.name,
      status: this.data.status,
      revealedRegions: [...(this.data.revealedRegions || [])],
      markers: this.data.markers,
      metadata: this.data.metadata || {},
      players: Array.from(this.presence.values()).map((p) => ({ id: p.id, role: p.role, name: p.name })),
      lastUpdated: this.data.lastUpdated,
    };
  }

  async persist() {
    await this.state.storage.put('state', this.data);
  }

  async broadcast(message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const [id, socket] of this.connections.entries()) {
      try {
        socket.send(payload);
      } catch (err) {
        console.error('Broadcast error', id, err);
      }
    }
  }

  broadcastPlayers() {
    const players = Array.from(this.presence.values()).map((p) => ({ id: p.id, role: p.role, name: p.name }));
    this.broadcast({ type: 'players', payload: { players } });
  }

  closeAll(code = 1000, reason = 'closing') {
    for (const socket of this.connections.values()) {
      try {
        socket.close(code, reason);
      } catch (err) {
        console.error('Close error', err);
      }
    }
    this.connections.clear();
    this.presence.clear();
  }
}
