const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8"
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS } });
    }
    const api = new ApiHandler(env, ctx);
    try {
      return await api.route(request);
    } catch (err) {
      console.error("Unhandled error", err);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  }
};

class ApiHandler {
  constructor(env, ctx) {
    this.env = env;
    this.ctx = ctx;
  }

  async route(request) {
    const url = new URL(request.url);
    let pathname = url.pathname;
    if (pathname !== "/" && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    const authUser = await this.getAuthenticatedUser(request.headers.get("authorization"));

    // Auth routes
    if (request.method === "POST" && pathname === "/api/auth/signup") {
      const body = await readJsonBody(request);
      return this.handleSignup(body);
    }

    if (request.method === "POST" && pathname === "/api/auth/login") {
      const body = await readJsonBody(request);
      return this.handleLogin(body);
    }

    // Campaigns
    if (request.method === "POST" && pathname === "/api/campaigns") {
      if (!authUser) return unauthorizedResponse();
      const body = await readJsonBody(request);
      return this.createCampaign(authUser, body);
    }

    if (request.method === "GET" && pathname === "/api/campaigns") {
      const isPublic = url.searchParams.get("public") === "1";
      return this.listCampaigns(authUser, isPublic);
    }

    // Maps
    if (request.method === "GET" && pathname === "/api/maps") {
      const campaignId = url.searchParams.get("campaignId");
      return this.listMaps(campaignId, authUser);
    }

    if (request.method === "POST" && pathname === "/api/maps") {
      if (!authUser) return unauthorizedResponse();
      const body = await readJsonBody(request);
      return this.createMap(authUser, body);
    }

    const regionListMatch = pathname.match(/^\/api\/maps\/(.+)\/regions$/);
    if (regionListMatch) {
      const mapId = regionListMatch[1];
      if (request.method === "GET") {
        return this.listRegions(mapId, authUser);
      }
      if (request.method === "POST") {
        if (!authUser) return unauthorizedResponse();
        const body = await readJsonBody(request);
        return this.createRegion(authUser, mapId, body);
      }
    }

    const regionItemMatch = pathname.match(/^\/api\/regions\/([^/]+)$/);
    if (regionItemMatch) {
      const regionId = regionItemMatch[1];
      if (!authUser) return unauthorizedResponse();
      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        return this.updateRegion(authUser, regionId, body);
      }
      if (request.method === "DELETE") {
        return this.deleteRegion(authUser, regionId);
      }
    }

    const markerListMatch = pathname.match(/^\/api\/maps\/(.+)\/markers$/);
    if (markerListMatch) {
      const mapId = markerListMatch[1];
      if (request.method === "GET") {
        return this.listMarkers(mapId, authUser);
      }
      if (request.method === "POST") {
        if (!authUser) return unauthorizedResponse();
        const body = await readJsonBody(request);
        return this.createMarker(authUser, mapId, body);
      }
    }

    const markerItemMatch = pathname.match(/^\/api\/markers\/([^/]+)$/);
    if (markerItemMatch) {
      const markerId = markerItemMatch[1];
      if (!authUser) return unauthorizedResponse();
      if (request.method === "PUT") {
        const body = await readJsonBody(request);
        return this.updateMarker(authUser, markerId, body);
      }
      if (request.method === "DELETE") {
        return this.deleteMarker(authUser, markerId);
      }
    }

    // Sessions
    if (request.method === "POST" && pathname === "/api/sessions") {
      if (!authUser) return unauthorizedResponse();
      const body = await readJsonBody(request);
      return this.createSession(authUser, body);
    }

    const sessionSaveMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/save$/);
    if (sessionSaveMatch && request.method === "POST") {
      if (!authUser) return unauthorizedResponse();
      return this.saveSession(authUser, sessionSaveMatch[1]);
    }

    const sessionEndMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/end$/);
    if (sessionEndMatch && request.method === "POST") {
      if (!authUser) return unauthorizedResponse();
      return this.endSession(authUser, sessionEndMatch[1]);
    }

    const sessionRestoreMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/restore$/);
    if (sessionRestoreMatch && request.method === "POST") {
      if (!authUser) return unauthorizedResponse();
      const body = await readJsonBody(request);
      return this.restoreSession(authUser, sessionRestoreMatch[1], body);
    }

    const sessionSocketMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/socket$/);
    if (sessionSocketMatch && request.headers.get("upgrade") === "websocket") {
      return this.sessionSocket(sessionSocketMatch[1], request);
    }

    if (request.method === "GET" && pathname === "/api/lobby") {
      return this.listLobby();
    }

    // Assets
    if (request.method === "POST" && pathname === "/api/assets/marker") {
      if (!authUser) return unauthorizedResponse();
      const body = await readJsonBody(request);
      return this.createMarkerUpload(authUser, body);
    }

    const assetGetMatch = pathname.match(/^\/api\/assets\/marker\/(.+)$/);
    if (assetGetMatch && request.method === "GET") {
      const assetKey = decodeURIComponent(assetGetMatch[1]);
      return this.getMarkerAsset(assetKey);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  }

  async handleSignup(body) {
    const { email, password, displayName } = body ?? {};
    if (!email || !password || password.length < 8 || !displayName) {
      return jsonResponse({ error: "Missing or invalid fields" }, 400);
    }

    const existing = await this.env.MAPS_DB.prepare("SELECT id FROM users WHERE email = ?").bind(email.toLowerCase()).first();
    if (existing) {
      return jsonResponse({ error: "Email already registered" }, 409);
    }

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = toBase64Url(saltBytes);
    const hash = await hashPassword(password, salt);
    const userId = crypto.randomUUID();

    await this.env.MAPS_DB.prepare(
      "INSERT INTO users (id, email, password_hash, password_salt, display_name) VALUES (?,?,?,?,?)"
    ).bind(userId, email.toLowerCase(), hash, salt, displayName).run();

    const token = await createJWT({ sub: userId, email: email.toLowerCase(), name: displayName }, this.env.SESSION_SECRET);
    return jsonResponse({ user: { id: userId, email: email.toLowerCase(), displayName }, token }, 201);
  }

  async handleLogin(body) {
    const { email, password } = body ?? {};
    if (!email || !password) {
      return jsonResponse({ error: "Missing credentials" }, 400);
    }

    const user = await this.env.MAPS_DB.prepare(
      "SELECT id, email, display_name AS displayName, password_hash AS passwordHash, password_salt AS passwordSalt FROM users WHERE email = ?"
    ).bind(email.toLowerCase()).first();
    if (!user) {
      return jsonResponse({ error: "Invalid credentials" }, 401);
    }

    const hash = await hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) {
      return jsonResponse({ error: "Invalid credentials" }, 401);
    }

    const token = await createJWT({ sub: user.id, email: user.email, name: user.displayName }, this.env.SESSION_SECRET);
    return jsonResponse({ user: { id: user.id, email: user.email, displayName: user.displayName }, token });
  }

  async listCampaigns(authUser, isPublic) {
    if (isPublic) {
      const campaigns = await this.env.MAPS_DB.prepare(
        "SELECT c.id, c.name, c.description, c.is_public AS isPublic, u.display_name AS ownerName FROM campaigns c JOIN users u ON c.owner_id = u.id WHERE c.is_public = 1 ORDER BY c.created_at DESC"
      ).all();
      return jsonResponse({ campaigns: campaigns.results });
    }

    if (!authUser) return unauthorizedResponse();
    const campaigns = await this.env.MAPS_DB.prepare(
      "SELECT id, name, description, is_public AS isPublic FROM campaigns WHERE owner_id = ? ORDER BY created_at DESC"
    ).bind(authUser.id).all();
    return jsonResponse({ campaigns: campaigns.results });
  }

  async createCampaign(authUser, body) {
    const { name, description, isPublic } = body ?? {};
    if (!name) return jsonResponse({ error: "Name required" }, 400);
    const id = crypto.randomUUID();
    await this.env.MAPS_DB.prepare(
      "INSERT INTO campaigns (id, owner_id, name, description, is_public) VALUES (?,?,?,?,?)"
    ).bind(id, authUser.id, name, description ?? null, isPublic ? 1 : 0).run();
    return jsonResponse({ campaign: { id, name, description, isPublic: !!isPublic } }, 201);
  }

  async listMaps(campaignId, authUser) {
    let query = "SELECT id, campaign_id AS campaignId, name, description, display_key AS displayKey, width, height FROM maps";
    const params = [];
    if (campaignId) {
      query += " WHERE campaign_id = ?";
      params.push(campaignId);
    }
    query += " ORDER BY created_at DESC";

    const maps = await this.env.MAPS_DB.prepare(query).bind(...params).all();
    return jsonResponse({ maps: maps.results });
  }

  async createMap(authUser, body) {
    const { campaignId, name, description, fileExtension = "png", width, height } = body ?? {};
    if (!campaignId || !name) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const campaign = await this.env.MAPS_DB.prepare(
      "SELECT id FROM campaigns WHERE id = ? AND owner_id = ?"
    ).bind(campaignId, authUser.id).first();
    if (!campaign) {
      return jsonResponse({ error: "Campaign not found" }, 404);
    }

    const mapId = crypto.randomUUID();
    const originalKey = `maps/${campaignId}/${mapId}/original.${fileExtension}`;
    const displayKey = `maps/${campaignId}/${mapId}/display.${fileExtension}`;

    await this.env.MAPS_DB.prepare(
      "INSERT INTO maps (id, campaign_id, name, description, original_key, display_key, width, height) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(mapId, campaignId, name, description ?? null, originalKey, displayKey, width ?? null, height ?? null).run();

    const originalUpload = await this.createPresignedPost(originalKey, body?.contentType ?? "image/png");
    const displayUpload = await this.createPresignedPost(displayKey, body?.contentType ?? "image/png");

    return jsonResponse({
      map: {
        id: mapId,
        campaignId,
        name,
        description,
        originalKey,
        displayKey,
        width: width ?? null,
        height: height ?? null
      },
      uploads: {
        original: originalUpload,
        display: displayUpload
      }
    }, 201);
  }

  async listRegions(mapId, authUser) {
    const regions = await this.env.MAPS_DB.prepare(
      "SELECT id, map_id AS mapId, name, polygon_json AS polygonJson, order_index AS orderIndex FROM regions WHERE map_id = ? ORDER BY order_index ASC"
    ).bind(mapId).all();
    return jsonResponse({ regions: regions.results });
  }

  async createRegion(authUser, mapId, body) {
    const { name, polygon, orderIndex = 0 } = body ?? {};
    if (!name || !Array.isArray(polygon)) {
      return jsonResponse({ error: "Invalid region data" }, 400);
    }
    const map = await this.getMapOwnedByUser(mapId, authUser.id);
    if (!map) return jsonResponse({ error: "Map not found" }, 404);

    const id = crypto.randomUUID();
    await this.env.MAPS_DB.prepare(
      "INSERT INTO regions (id, map_id, name, polygon_json, order_index) VALUES (?,?,?,?,?)"
    ).bind(id, mapId, name, JSON.stringify(polygon), orderIndex).run();

    return jsonResponse({ region: { id, mapId, name, polygon, orderIndex } }, 201);
  }

  async updateRegion(authUser, regionId, body) {
    const region = await this.env.MAPS_DB.prepare(
      "SELECT r.id, r.map_id AS mapId, m.campaign_id AS campaignId FROM regions r JOIN maps m ON r.map_id = m.id WHERE r.id = ?"
    ).bind(regionId).first();
    if (!region) return jsonResponse({ error: "Region not found" }, 404);

    const campaign = await this.env.MAPS_DB.prepare(
      "SELECT id FROM campaigns WHERE id = ? AND owner_id = ?"
    ).bind(region.campaignId, authUser.id).first();
    if (!campaign) return unauthorizedResponse();

    const fields = [];
    const values = [];
    if (body?.name) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body?.polygon) {
      fields.push("polygon_json = ?");
      values.push(JSON.stringify(body.polygon));
    }
    if (typeof body?.orderIndex === "number") {
      fields.push("order_index = ?");
      values.push(body.orderIndex);
    }
    if (!fields.length) {
      return jsonResponse({ error: "No updates provided" }, 400);
    }

    await this.env.MAPS_DB.prepare(
      `UPDATE regions SET ${fields.join(", ")} WHERE id = ?`
    ).bind(...values, regionId).run();

    return jsonResponse({ success: true });
  }

  async deleteRegion(authUser, regionId) {
    const region = await this.env.MAPS_DB.prepare(
      "SELECT r.id, m.campaign_id AS campaignId FROM regions r JOIN maps m ON r.map_id = m.id WHERE r.id = ?"
    ).bind(regionId).first();
    if (!region) return jsonResponse({ error: "Region not found" }, 404);
    const campaign = await this.env.MAPS_DB.prepare(
      "SELECT id FROM campaigns WHERE id = ? AND owner_id = ?"
    ).bind(region.campaignId, authUser.id).first();
    if (!campaign) return unauthorizedResponse();

    await this.env.MAPS_DB.prepare("DELETE FROM regions WHERE id = ?").bind(regionId).run();
    return jsonResponse({ success: true });
  }

  async listMarkers(mapId) {
    const markers = await this.env.MAPS_DB.prepare(
      "SELECT id, map_id AS mapId, name, marker_type AS markerType, position_json AS positionJson, data_json AS dataJson FROM markers WHERE map_id = ? ORDER BY created_at ASC"
    ).bind(mapId).all();
    return jsonResponse({ markers: markers.results });
  }

  async createMarker(authUser, mapId, body) {
    const { name, markerType, position, data } = body ?? {};
    if (!name || !markerType || !position) {
      return jsonResponse({ error: "Invalid marker data" }, 400);
    }
    const map = await this.getMapOwnedByUser(mapId, authUser.id);
    if (!map) return jsonResponse({ error: "Map not found" }, 404);

    const id = crypto.randomUUID();
    await this.env.MAPS_DB.prepare(
      "INSERT INTO markers (id, map_id, name, marker_type, position_json, data_json) VALUES (?,?,?,?,?,?)"
    ).bind(id, mapId, name, markerType, JSON.stringify(position), data ? JSON.stringify(data) : null).run();

    return jsonResponse({ marker: { id, mapId, name, markerType, position, data } }, 201);
  }

  async updateMarker(authUser, markerId, body) {
    const marker = await this.env.MAPS_DB.prepare(
      "SELECT mk.id, mk.map_id AS mapId, m.campaign_id AS campaignId FROM markers mk JOIN maps m ON mk.map_id = m.id WHERE mk.id = ?"
    ).bind(markerId).first();
    if (!marker) return jsonResponse({ error: "Marker not found" }, 404);
    const campaign = await this.env.MAPS_DB.prepare(
      "SELECT id FROM campaigns WHERE id = ? AND owner_id = ?"
    ).bind(marker.campaignId, authUser.id).first();
    if (!campaign) return unauthorizedResponse();

    const fields = [];
    const values = [];
    if (body?.name) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body?.markerType) {
      fields.push("marker_type = ?");
      values.push(body.markerType);
    }
    if (body?.position) {
      fields.push("position_json = ?");
      values.push(JSON.stringify(body.position));
    }
    if (body?.data) {
      fields.push("data_json = ?");
      values.push(JSON.stringify(body.data));
    }
    if (!fields.length) {
      return jsonResponse({ error: "No updates provided" }, 400);
    }
    await this.env.MAPS_DB.prepare(
      `UPDATE markers SET ${fields.join(", ")} WHERE id = ?`
    ).bind(...values, markerId).run();
    return jsonResponse({ success: true });
  }

  async deleteMarker(authUser, markerId) {
    const marker = await this.env.MAPS_DB.prepare(
      "SELECT mk.id, m.campaign_id AS campaignId FROM markers mk JOIN maps m ON mk.map_id = m.id WHERE mk.id = ?"
    ).bind(markerId).first();
    if (!marker) return jsonResponse({ error: "Marker not found" }, 404);
    const campaign = await this.env.MAPS_DB.prepare(
      "SELECT id FROM campaigns WHERE id = ? AND owner_id = ?"
    ).bind(marker.campaignId, authUser.id).first();
    if (!campaign) return unauthorizedResponse();

    await this.env.MAPS_DB.prepare("DELETE FROM markers WHERE id = ?").bind(markerId).run();
    return jsonResponse({ success: true });
  }

  async createSession(authUser, body) {
    const { campaignId, name, mapId } = body ?? {};
    if (!campaignId || !name || !mapId) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const campaign = await this.env.MAPS_DB.prepare(
      "SELECT id FROM campaigns WHERE id = ? AND owner_id = ?"
    ).bind(campaignId, authUser.id).first();
    if (!campaign) {
      return jsonResponse({ error: "Campaign not found" }, 404);
    }

    const map = await this.env.MAPS_DB.prepare(
      "SELECT id, display_key AS displayKey, width, height FROM maps WHERE id = ? AND campaign_id = ?"
    ).bind(mapId, campaignId).first();
    if (!map) return jsonResponse({ error: "Map not found" }, 404);

    const sessionId = crypto.randomUUID();
    await this.env.MAPS_DB.prepare(
      "INSERT INTO sessions (id, campaign_id, map_id, name, status) VALUES (?,?,?,?,?)"
    ).bind(sessionId, campaignId, mapId, name, "active").run();

    const regions = await this.env.MAPS_DB.prepare(
      "SELECT id, polygon_json AS polygonJson, name, order_index AS orderIndex FROM regions WHERE map_id = ? ORDER BY order_index ASC"
    ).bind(mapId).all();
    const markers = await this.env.MAPS_DB.prepare(
      "SELECT id, name, marker_type AS markerType, position_json AS positionJson, data_json AS dataJson FROM markers WHERE map_id = ?"
    ).bind(mapId).all();

    const stub = this.env.SESSION_HUB.get(this.env.SESSION_HUB.idFromName(sessionId));
    await stub.fetch("https://session/init", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId,
        campaignId,
        mapId,
        map,
        regions: regions.results.map((r) => ({
          id: r.id,
          name: r.name,
          polygon: JSON.parse(r.polygonJson),
          orderIndex: r.orderIndex
        })),
        markers: markers.results.map((m) => ({
          id: m.id,
          name: m.name,
          markerType: m.markerType,
          position: JSON.parse(m.positionJson),
          data: m.dataJson ? JSON.parse(m.dataJson) : null
        }))
      })
    });

    return jsonResponse({ session: { id: sessionId, campaignId, mapId, name, status: "active" } }, 201);
  }

  async saveSession(authUser, sessionId) {
    const session = await this.getSessionForUser(sessionId, authUser.id);
    if (!session) return jsonResponse({ error: "Session not found" }, 404);

    const stub = this.env.SESSION_HUB.get(this.env.SESSION_HUB.idFromName(sessionId));
    const res = await stub.fetch("https://session/state");
    if (!res.ok) {
      return jsonResponse({ error: "Unable to snapshot session" }, 500);
    }
    const state = await res.json();

    const key = buildBackupKey(session.campaign_id ?? session.campaignId);
    await this.env.MAPS_BUCKET.put(key, JSON.stringify(state), {
      httpMetadata: { contentType: "application/json" }
    });

    const backupId = crypto.randomUUID();
    await this.env.MAPS_DB.prepare(
      "INSERT INTO session_backups (id, session_id, backup_key) VALUES (?,?,?)"
    ).bind(backupId, sessionId, key).run();

    return jsonResponse({ backupKey: key, state });
  }

  async endSession(authUser, sessionId) {
    const session = await this.getSessionForUser(sessionId, authUser.id);
    if (!session) return jsonResponse({ error: "Session not found" }, 404);

    await this.env.MAPS_DB.prepare(
      "UPDATE sessions SET status = 'ended', updated_at = datetime('now') WHERE id = ?"
    ).bind(sessionId).run();

    const stub = this.env.SESSION_HUB.get(this.env.SESSION_HUB.idFromName(sessionId));
    await stub.fetch("https://session/end", { method: "POST" });

    return jsonResponse({ success: true });
  }

  async restoreSession(authUser, sessionId, body) {
    const { backupKey, clone } = body ?? {};
    if (!backupKey) return jsonResponse({ error: "backupKey required" }, 400);

    const session = await this.getSessionForUser(sessionId, authUser.id);
    if (!session) return jsonResponse({ error: "Session not found" }, 404);

    const object = await this.env.MAPS_BUCKET.get(backupKey);
    if (!object) return jsonResponse({ error: "Backup not found" }, 404);
    const stateText = await object.text();
    const state = JSON.parse(stateText || "{}");

    if (clone) {
      const newSessionId = crypto.randomUUID();
      await this.env.MAPS_DB.prepare(
        "INSERT INTO sessions (id, campaign_id, map_id, name, status) VALUES (?,?,?,?,?)"
      ).bind(newSessionId, session.campaign_id, session.map_id, `${session.name} (Clone)`, "active").run();
      const stub = this.env.SESSION_HUB.get(this.env.SESSION_HUB.idFromName(newSessionId));
      await stub.fetch("https://session/restore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state)
      });
      return jsonResponse({ session: { id: newSessionId, campaignId: session.campaign_id, mapId: session.map_id, name: `${session.name} (Clone)`, status: "active" } }, 201);
    }

    const stub = this.env.SESSION_HUB.get(this.env.SESSION_HUB.idFromName(sessionId));
    await stub.fetch("https://session/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(state)
    });

    return jsonResponse({ success: true });
  }

  async sessionSocket(sessionId, request) {
    const stub = this.env.SESSION_HUB.get(this.env.SESSION_HUB.idFromName(sessionId));
    return stub.fetch(request);
  }

  async listLobby() {
    const results = await this.env.MAPS_DB.prepare(
      "SELECT s.id, s.name, s.status, s.campaign_id AS campaignId, s.map_id AS mapId, m.display_key AS displayKey FROM sessions s JOIN maps m ON s.map_id = m.id WHERE s.status = 'active' ORDER BY s.created_at DESC"
    ).all();
    return jsonResponse({ sessions: results.results });
  }

  async createMarkerUpload(authUser, body) {
    const { extension = "png", contentType = "image/png" } = body ?? {};
    const key = `assets/${authUser.id}/${crypto.randomUUID()}.${extension}`;
    const upload = await this.createPresignedPost(key, contentType);
    return jsonResponse({ key, upload });
  }

  async getMarkerAsset(assetKey) {
    try {
      const signed = await this.env.MAPS_BUCKET.createSignedUrl({
        key: assetKey,
        expiration: 60
      });
      return jsonResponse({ url: signed.toString() });
    } catch (err) {
      console.error("Signed URL error", err);
      return jsonResponse({ error: "Unable to sign asset" }, 500);
    }
  }

  async getAuthenticatedUser(authHeader) {
    if (!authHeader) return null;
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") return null;
    try {
      const payload = await verifyJWT(parts[1], this.env.SESSION_SECRET);
      if (!payload) return null;
      const user = await this.env.MAPS_DB.prepare(
        "SELECT id, email, display_name AS displayName FROM users WHERE id = ?"
      ).bind(payload.sub).first();
      return user ?? null;
    } catch (err) {
      console.error("Auth parse error", err);
      return null;
    }
  }

  async getMapOwnedByUser(mapId, userId) {
    return this.env.MAPS_DB.prepare(
      "SELECT m.id FROM maps m JOIN campaigns c ON m.campaign_id = c.id WHERE m.id = ? AND c.owner_id = ?"
    ).bind(mapId, userId).first();
  }

  async getSessionForUser(sessionId, userId) {
    return this.env.MAPS_DB.prepare(
      "SELECT s.id, s.campaign_id, s.map_id, s.name FROM sessions s JOIN campaigns c ON s.campaign_id = c.id WHERE s.id = ? AND c.owner_id = ?"
    ).bind(sessionId, userId).first();
  }

  async createPresignedPost(key, contentType) {
    const presigned = await this.env.MAPS_BUCKET.createPresignedPost({
      key,
      expiration: 60 * 10,
      fields: {
        "Content-Type": contentType
      }
    });
    return {
      url: presigned.url,
      fields: presigned.fields
    };
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...CORS_HEADERS
    }
  });
}

function unauthorizedResponse() {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

async function readJsonBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error("Invalid JSON body");
  }
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

async function createJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const fullPayload = { ...payload, exp };
  const encoder = new TextEncoder();
  const base = `${toBase64Url(encoder.encode(JSON.stringify(header)))}.${toBase64Url(encoder.encode(JSON.stringify(fullPayload)))}`;
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(base));
  return `${base}.${toBase64Url(new Uint8Array(signature))}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const encoder = new TextEncoder();
  const base = `${parts[0]}.${parts[1]}`;
  const key = await getHmacKey(secret);
  const signature = fromBase64Url(parts[2]);
  const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(base));
  if (!valid) return null;
  const payloadJson = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  if (payloadJson.exp && payloadJson.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payloadJson;
}

async function getHmacKey(secret) {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey("raw", encoder.encode(secret), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign", "verify"]);
}

function toBase64Url(uint8) {
  if (uint8 instanceof Uint8Array) {
    let str = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      str += String.fromCharCode.apply(null, uint8.slice(i, i + chunkSize));
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return btoa(uint8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildBackupKey(campaignId) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `backups/${campaignId}/${yyyy}/${mm}/${dd}/${hh}${min}${ss}.json`;
}
