export class SessionHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clients = new Map();
    this.loaded = false;
    this.data = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      await this.ensureState();
      this.handleSocket(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/init" && request.method === "POST") {
      const body = await request.json();
      await this.initializeState(body);
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/state") {
      await this.ensureState();
      return jsonResponse(this.serializeState());
    }

    if (url.pathname === "/restore" && request.method === "POST") {
      const body = await request.json();
      await this.restoreState(body);
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/end" && request.method === "POST") {
      await this.ensureState();
      this.data.status = "ended";
      await this.saveState();
      this.broadcast({ type: "state", state: this.serializeState() });
      for (const [id, info] of this.clients.entries()) {
        info.socket.close(1000, "Session ended");
      }
      this.clients.clear();
      return new Response(null, { status: 204 });
    }

    return jsonResponse({ ok: true });
  }

  async ensureState() {
    if (this.loaded) return;
    this.data = await this.state.storage.get("state");
    if (!this.data) {
      this.data = {
        sessionId: null,
        campaignId: null,
        mapId: null,
        map: null,
        regions: [],
        revealedRegions: [],
        markers: {},
        status: "pending",
        players: {}
      };
    }
    this.loaded = true;
  }

  async initializeState(body) {
    await this.ensureState();
    this.data = {
      sessionId: body.sessionId,
      campaignId: body.campaignId,
      mapId: body.mapId,
      map: body.map ?? null,
      regions: body.regions ?? [],
      revealedRegions: [],
      markers: Object.fromEntries((body.markers ?? []).map((m) => [m.id, m])),
      status: "active",
      players: {}
    };
    await this.saveState();
    this.broadcast({ type: "state", state: this.serializeState() });
  }

  async restoreState(body) {
    await this.ensureState();
    const next = {
      sessionId: body.sessionId ?? this.data.sessionId,
      campaignId: body.campaignId ?? this.data.campaignId,
      mapId: body.mapId ?? this.data.mapId,
      map: body.map ?? this.data.map,
      regions: body.regions ?? this.data.regions,
      revealedRegions: body.revealedRegions ?? body.revealed ?? [],
      markers: body.markers ?? {},
      status: body.status ?? "active",
      players: {}
    };
    if (!next.revealedRegions || !Array.isArray(next.revealedRegions)) {
      next.revealedRegions = [];
    }
    if (!next.markers || typeof next.markers !== "object") {
      next.markers = {};
    }
    this.data = next;
    await this.saveState();
    this.broadcast({ type: "state", state: this.serializeState() });
  }

  serializeState() {
    return {
      sessionId: this.data.sessionId,
      campaignId: this.data.campaignId,
      mapId: this.data.mapId,
      map: this.data.map,
      regions: this.data.regions,
      revealedRegions: this.data.revealedRegions,
      markers: this.data.markers,
      status: this.data.status
    };
  }

  async saveState() {
    const { players, ...rest } = this.data;
    await this.state.storage.put("state", rest);
  }

  handleSocket(socket, url) {
    const clientId = crypto.randomUUID();
    const info = { socket, id: clientId, role: "player", name: "" };
    this.clients.set(clientId, info);

    socket.accept();
    socket.addEventListener("message", (event) => {
      this.onMessage(info, event.data);
    });

    socket.addEventListener("close", () => {
      this.clients.delete(clientId);
      delete this.data.players[clientId];
      this.broadcastPlayers();
    });

    socket.send(JSON.stringify({ type: "state", state: this.serializeState() }));
    this.broadcastPlayers();
  }

  async onMessage(clientInfo, raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch (err) {
      console.warn("Invalid message", raw);
      return;
    }
    switch (message.type) {
      case "join":
        clientInfo.role = message.role ?? "player";
        clientInfo.name = message.name ?? "Player";
        this.data.players[clientInfo.id] = {
          id: clientInfo.id,
          name: clientInfo.name,
          role: clientInfo.role,
          connectedAt: Date.now()
        };
        this.send(clientInfo.socket, { type: "state", state: this.serializeState() });
        this.broadcastPlayers();
        break;
      case "revealRegions":
        await this.ensureState();
        this.applyReveal(Array.isArray(message.regionIds) ? message.regionIds : []);
        break;
      case "hideRegions":
        await this.ensureState();
        this.applyHide(Array.isArray(message.regionIds) ? message.regionIds : []);
        break;
      case "placeMarker":
        await this.ensureState();
        this.placeMarker(message.marker ?? {});
        break;
      case "updateMarker":
        await this.ensureState();
        this.updateMarker(message.markerId, message.changes ?? {});
        break;
      case "removeMarker":
        await this.ensureState();
        this.removeMarker(message.markerId);
        break;
      case "ping":
        this.send(clientInfo.socket, { type: "pong", ts: Date.now() });
        break;
      default:
        console.warn("Unknown message type", message.type);
    }
  }

  async applyReveal(regionIds) {
    let changed = false;
    for (const id of regionIds) {
      if (!this.data.revealedRegions.includes(id)) {
        this.data.revealedRegions.push(id);
        changed = true;
      }
    }
    if (changed) {
      await this.saveState();
      this.broadcast({ type: "regionsRevealed", regionIds });
    }
  }

  async applyHide(regionIds) {
    const before = this.data.revealedRegions.length;
    this.data.revealedRegions = this.data.revealedRegions.filter((id) => !regionIds.includes(id));
    if (this.data.revealedRegions.length !== before) {
      await this.saveState();
      this.broadcast({ type: "regionsHidden", regionIds });
    }
  }

  async placeMarker(marker) {
    if (!marker) return;
    if (!marker.id) {
      marker.id = crypto.randomUUID();
    }
    marker.createdAt = marker.createdAt ?? Date.now();
    this.data.markers[marker.id] = marker;
    await this.saveState();
    this.broadcast({ type: "markerAdded", marker });
  }

  async updateMarker(markerId, changes) {
    if (!markerId || !this.data.markers[markerId]) return;
    const marker = this.data.markers[markerId];
    Object.assign(marker, changes ?? {});
    marker.updatedAt = Date.now();
    await this.saveState();
    this.broadcast({ type: "markerUpdated", marker });
  }

  async removeMarker(markerId) {
    if (!markerId || !this.data.markers[markerId]) return;
    delete this.data.markers[markerId];
    await this.saveState();
    this.broadcast({ type: "markerRemoved", markerId });
  }

  send(socket, payload) {
    try {
      socket.send(JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to send", err);
    }
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const { socket } of this.clients.values()) {
      try {
        socket.send(message);
      } catch (err) {
        console.warn("Broadcast error", err);
      }
    }
  }

  broadcastPlayers() {
    const players = Object.values(this.data.players ?? {});
    this.broadcast({ type: "players", players });
  }
}

export default {
  fetch(request) {
    return new Response("Session Durable Object", { status: 200 });
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
