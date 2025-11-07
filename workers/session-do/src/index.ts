interface JsonResponseInit extends ResponseInit {}

interface SessionMarker {
  id: string;
  label: string;
  x: number;
  y: number;
  color: string;
  iconKey: string | null;
  notes: string | null;
}

interface SessionData {
  sessionId: string | null;
  campaignId: string | null;
  mapId: string | null;
  hostId: string | null;
  name: string | null;
  status: string;
  revealedRegions: string[];
  revealedMarkers: string[];
  markers: Record<string, SessionMarker>;
  metadata: Record<string, unknown>;
  lastUpdated: string;
}

interface PresenceMeta {
  id: string;
  role: string;
  name: string;
  connectedAt: string;
}

interface BroadcastMessage {
  type: string;
  payload?: unknown;
  [key: string]: unknown;
}

function jsonResponse<T>(data: T, init: JsonResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export default {
  async fetch(_request: Request): Promise<Response> {
    return new Response('Session Durable Object', { status: 200 });
  },
};

export class SessionHub {
  private readonly state: DurableObjectState;

  private readonly env: Env;

  private readonly connections = new Map<string, WebSocket>();

  private readonly presence = new Map<string, PresenceMeta>();

  private data: SessionData = {
    sessionId: null,
    campaignId: null,
    mapId: null,
    hostId: null,
    name: null,
    status: 'idle',
    revealedRegions: [],
    revealedMarkers: [],
    markers: {},
    metadata: {},
    lastUpdated: new Date().toISOString(),
  };

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<SessionData>('state');
      if (stored) {
        this.data = stored;
        if (!Array.isArray(this.data.revealedRegions)) {
          this.data.revealedRegions = [];
        }
        if (!Array.isArray(this.data.revealedMarkers)) {
          this.data.revealedMarkers = [];
        }
        if (!this.data.markers || typeof this.data.markers !== 'object') {
          this.data.markers = {};
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
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

  private async handleSetup(request: Request): Promise<Response> {
    const body = await request.json() as Record<string, unknown>;
    this.data.sessionId = (body.sessionId as string) || null;
    this.data.campaignId = (body.campaignId as string) || null;
    this.data.mapId = (body.mapId as string) || null;
    this.data.hostId = (body.hostId as string) || null;
    this.data.name = (body.name as string) || null;
    this.data.status = 'active';
    this.data.revealedRegions = [];
    this.data.revealedMarkers = [];
    this.data.markers = {};
    this.data.metadata = (body.metadata as Record<string, unknown>) || {};
    this.data.lastUpdated = new Date().toISOString();
    await this.persist();
    await this.broadcast({ type: 'state', payload: await this.exportState() });
    return jsonResponse({ success: true });
  }

  private async handleRestore(request: Request): Promise<Response> {
    const body = await request.json() as { state?: Partial<SessionData>; clone?: boolean };
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
      if (!Array.isArray(this.data.revealedMarkers)) {
        this.data.revealedMarkers = [];
      }
      if (!this.data.markers || typeof this.data.markers !== 'object') {
        this.data.markers = {};
      }
      await this.persist();
      await this.broadcast({ type: 'state', payload: await this.exportState() });
    }
    return jsonResponse({ success: true });
  }

  private async handleEnd(): Promise<Response> {
    this.data.status = 'ended';
    this.data.lastUpdated = new Date().toISOString();
    await this.persist();
    await this.broadcast({ type: 'state', payload: await this.exportState() });
    this.closeAll(1000, 'Session ended');
    return jsonResponse({ success: true });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    const connectionId = crypto.randomUUID();
    const role = url.searchParams.get('role') || 'player';
    const name = url.searchParams.get('name') || (role === 'dm' ? 'Dungeon Master' : 'Player');

    const meta: PresenceMeta = { id: connectionId, role, name, connectedAt: new Date().toISOString() };
    this.connections.set(connectionId, server);
    this.presence.set(connectionId, meta);

    server.addEventListener('message', (event) => {
      const messageEvent = event as MessageEvent;
      this.handleMessage(connectionId, server, messageEvent).catch((err) => {
        console.error('Message handling error', err);
        try {
          server.send(JSON.stringify({ type: 'error', error: 'Internal error' }));
        } catch (sendErr) {
          console.error('Failed to send error message', sendErr);
        }
      });
    });

    const cleanup = (): void => {
      this.connections.delete(connectionId);
      this.presence.delete(connectionId);
      void this.broadcastPlayers();
    };

    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.send(JSON.stringify({ type: 'state', payload: await this.exportState() }));
    void this.broadcastPlayers();

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async handleMessage(connectionId: string, socket: WebSocket, event: MessageEvent): Promise<void> {
    const dataRaw = typeof event.data === 'string' ? event.data : '';
    let data: BroadcastMessage;
    try {
      data = JSON.parse(dataRaw) as BroadcastMessage;
    } catch (err) {
      socket.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
      return;
    }

    const parseIdList = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return [];
      }
      const filtered = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
      return Array.from(new Set(filtered));
    };

    switch (data.type) {
      case 'join':
        if (typeof (data as any).name === 'string') {
          const meta = this.presence.get(connectionId);
          if (meta) {
            meta.name = (data as any).name;
            meta.role = (data as any).role || meta.role;
            this.presence.set(connectionId, meta);
            void this.broadcastPlayers();
          }
        }
        socket.send(JSON.stringify({ type: 'state', payload: await this.exportState() }));
        break;
      case 'revealRegions': {
        const regionIds = Array.isArray((data as any).regionIds) ? (data as any).regionIds as string[] : [];
        if (regionIds.length) {
          const newIds = regionIds.filter((id) => !this.data.revealedRegions.includes(id));
          if (newIds.length) {
            this.data.revealedRegions = [...this.data.revealedRegions, ...newIds];
            this.data.lastUpdated = new Date().toISOString();
            await this.persist();
            await this.broadcast({ type: 'regionsRevealed', payload: { regionIds: newIds } });
          }
        }
        break;
      }
      case 'hideRegions': {
        const regionIds = Array.isArray((data as any).regionIds) ? (data as any).regionIds as string[] : [];
        if (regionIds.length) {
          const remaining = this.data.revealedRegions.filter((id) => !regionIds.includes(id));
          if (remaining.length !== this.data.revealedRegions.length) {
            this.data.revealedRegions = remaining;
            this.data.lastUpdated = new Date().toISOString();
            await this.persist();
            await this.broadcast({ type: 'regionsHidden', payload: { regionIds } });
          }
        }
        break;
      }
      case 'revealMarkers': {
        const markerIds = parseIdList((data as any).markerIds);
        if (markerIds.length) {
          const newIds = markerIds.filter((id) => !this.data.revealedMarkers.includes(id));
          if (newIds.length) {
            this.data.revealedMarkers = [...this.data.revealedMarkers, ...newIds];
            this.data.lastUpdated = new Date().toISOString();
            await this.persist();
            await this.broadcast({ type: 'markersRevealed', payload: { markerIds: newIds } });
          }
        }
        break;
      }
      case 'hideMarkers': {
        const markerIds = parseIdList((data as any).markerIds);
        if (markerIds.length) {
          const remaining = this.data.revealedMarkers.filter((id) => !markerIds.includes(id));
          if (remaining.length !== this.data.revealedMarkers.length) {
            this.data.revealedMarkers = remaining;
            this.data.lastUpdated = new Date().toISOString();
            await this.persist();
            await this.broadcast({ type: 'markersHidden', payload: { markerIds } });
          }
        }
        break;
      }
      case 'placeMarker': {
        const marker = (data as any).marker as Partial<SessionMarker> | undefined;
        if (marker && typeof marker === 'object') {
          const markerId = marker.id || crypto.randomUUID();
          this.data.markers[markerId] = {
            id: markerId,
            label: marker.label || 'Marker',
            x: marker.x ?? 0,
            y: marker.y ?? 0,
            color: marker.color || '#facc15',
            iconKey: marker.iconKey ?? null,
            notes: marker.notes ?? null,
          };
          this.data.lastUpdated = new Date().toISOString();
          await this.persist();
          await this.broadcast({ type: 'markerAdded', payload: { marker: this.data.markers[markerId] } });
        }
        break;
      }
      case 'updateMarker': {
        const marker = (data as any).marker as Partial<SessionMarker> | undefined;
        if (marker?.id && this.data.markers[marker.id]) {
          this.data.markers[marker.id] = {
            ...this.data.markers[marker.id],
            ...marker,
            id: marker.id,
          };
          this.data.lastUpdated = new Date().toISOString();
          await this.persist();
          await this.broadcast({ type: 'markerUpdated', payload: { marker: this.data.markers[marker.id] } });
        }
        break;
      }
      case 'removeMarker': {
        const markerId = (data as any).markerId as string | undefined;
        if (markerId && this.data.markers[markerId]) {
          const marker = this.data.markers[markerId];
          delete this.data.markers[markerId];
          this.data.lastUpdated = new Date().toISOString();
          await this.persist();
          await this.broadcast({ type: 'markerRemoved', payload: { markerId, marker } });
        }
        break;
      }
      case 'ping':
        socket.send(JSON.stringify({ type: 'pong', payload: { now: Date.now() } }));
        break;
      default:
        socket.send(JSON.stringify({ type: 'error', error: 'Unknown message type' }));
    }
  }

  private async exportState(): Promise<Record<string, unknown>> {
    return {
      sessionId: this.data.sessionId,
      campaignId: this.data.campaignId,
      mapId: this.data.mapId,
      hostId: this.data.hostId,
      name: this.data.name,
      status: this.data.status,
      revealedRegions: [...(this.data.revealedRegions || [])],
      revealedMarkers: [...(this.data.revealedMarkers || [])],
      markers: this.data.markers,
      metadata: this.data.metadata || {},
      players: Array.from(this.presence.values()).map((p) => ({ id: p.id, role: p.role, name: p.name })),
      lastUpdated: this.data.lastUpdated,
    };
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('state', this.data);
  }

  private async broadcast(message: BroadcastMessage | string): Promise<void> {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const [id, socket] of this.connections.entries()) {
      try {
        socket.send(payload);
      } catch (err) {
        console.error('Broadcast error', id, err);
      }
    }
  }

  private async broadcastPlayers(): Promise<void> {
    const players = Array.from(this.presence.values()).map((p) => ({ id: p.id, role: p.role, name: p.name }));
    await this.broadcast({ type: 'players', payload: { players } });
  }

  private closeAll(code = 1000, reason = 'closing'): void {
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
