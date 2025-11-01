const textEncoder = new TextEncoder();

interface JsonResponseInit extends ResponseInit {}

type JsonValue = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

type JwtPayload = Record<string, unknown> & {
  sub?: string;
  exp?: number;
};

interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

interface MapRecord {
  id: string;
  campaignId: string;
  ownerId: string;
  name: string;
  originalKey: string;
  displayKey: string;
  width: number | null;
  height: number | null;
  metadata: unknown;
}

interface RegionRecord {
  id: string;
  mapId: string;
  name: string;
  polygon: unknown;
  notes: string | null;
  revealOrder: number | null;
}

interface MarkerRecord {
  id: string;
  mapId: string;
  label: string;
  description: string | null;
  notes: string | null;
  regionId: string | null;
  iconKey: string | null;
  x: number | null;
  y: number | null;
  color: string | null;
  data: unknown;
}

function jsonResponse<T extends JsonValue | Record<string, unknown>>(data: T, init: JsonResponseInit = {}): Response {
  const { headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Access-Control-Allow-Origin')) {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  const responseInit: ResponseInit = {
    ...rest,
    headers,
  };
  return new Response(JSON.stringify(data), responseInit);
}

function errorResponse(message: string, status = 400, init: JsonResponseInit = {}): Response {
  return jsonResponse({ error: message }, { ...init, status });
}

async function parseJSON<T = unknown>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch (err) {
    console.error('Failed to parse JSON body', err);
    return null;
  }
}

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let string = '';
  bytes.forEach((b) => {
    string += String.fromCharCode(b);
  });
  return btoa(string).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}

async function hashPassword(password: string, salt?: string): Promise<{ salt: string; hash: string }> {
  const saltBytes = salt ? base64UrlDecode(salt) : crypto.getRandomValues(new Uint8Array(16));
  const combined = new Uint8Array(saltBytes.length + password.length);
  combined.set(saltBytes, 0);
  combined.set(textEncoder.encode(password), saltBytes.length);
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
  return {
    salt: base64UrlEncode(saltBytes),
    hash: base64UrlEncode(hashBuffer),
  };
}

async function createJwt(payload: Record<string, unknown>, secret: string, expiresInSeconds = 60 * 60 * 24 * 30): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInSeconds;
  const data = { ...payload, iat: now, exp };
  const encodedHeader = base64UrlEncode(textEncoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(textEncoder.encode(JSON.stringify(data)));
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  const signature = base64UrlEncode(signatureBuffer);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function verifyJwt(token: string | null, secret: string): Promise<JwtPayload | null> {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JwtPayload;
  } catch (err) {
    console.error('Failed to decode JWT payload', err);
    return null;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signature),
    textEncoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

async function requireUser(env: Env, request: Request): Promise<SessionUser | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }
  const token = authHeader.replace(/Bearer\s+/i, '').trim();
  const payload = await verifyJwt(token, env.SESSION_SECRET);
  if (!payload?.sub) return null;
  const stmt = env.MAPS_DB.prepare('SELECT id, email, display_name as displayName FROM users WHERE id = ?');
  const result = await stmt.bind(payload.sub).first<SessionUser>();
  return result || null;
}

function createCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

async function ensureCampaignOwnership(env: Env, campaignId: string, userId: string): Promise<boolean> {
  const stmt = env.MAPS_DB.prepare('SELECT id FROM campaigns WHERE id = ? AND owner_id = ?');
  const result = await stmt.bind(campaignId, userId).first();
  return !!result;
}

async function ensureMapOwnership(env: Env, mapId: string, userId: string): Promise<boolean> {
  const stmt = env.MAPS_DB.prepare('SELECT id FROM maps WHERE id = ? AND owner_id = ?');
  const result = await stmt.bind(mapId, userId).first();
  return !!result;
}

async function createSignedUpload(bucket: R2Bucket, key: string, method: 'GET' | 'PUT' | 'POST' = 'PUT', expiration = 900): Promise<URL | string> {
  return bucket.createSignedUrl({
    key,
    method,
    expiration,
  });
}

async function getSessionStub(env: Env, sessionId: string): Promise<DurableObjectStub> {
  const id = env.SESSION_HUB.idFromName(sessionId);
  return env.SESSION_HUB.get(id);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = createCorsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/ws$/) && request.headers.get('Upgrade') === 'websocket') {
      const sessionId = url.pathname.split('/')[3];
      const stub = await getSessionStub(env, sessionId);
      return stub.fetch(request);
    }

    try {
      if (url.pathname === '/api/auth/signup' && request.method === 'POST') {
        const body = await parseJSON<Record<string, string>>(request);
        if (!body || !body.email || !body.password || !body.displayName) {
          return errorResponse('Missing required fields', 400, { headers: corsHeaders });
        }
        const existing = await env.MAPS_DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first();
        if (existing) {
          return errorResponse('Email already registered', 409, { headers: corsHeaders });
        }
        const { salt, hash } = await hashPassword(body.password);
        const userId = crypto.randomUUID();
        await env.MAPS_DB.prepare(
          'INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
        ).bind(userId, body.email, body.displayName, hash, salt).run();
        const token = await createJwt({ sub: userId, email: body.email }, env.SESSION_SECRET);
        return jsonResponse({
          token,
          user: { id: userId, email: body.email, displayName: body.displayName },
        }, { status: 201, headers: corsHeaders });
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await parseJSON<Record<string, string>>(request);
        if (!body || !body.email || !body.password) {
          return errorResponse('Missing credentials', 400, { headers: corsHeaders });
        }
        const user = await env.MAPS_DB.prepare('SELECT id, email, display_name as displayName, password_hash, password_salt FROM users WHERE email = ?')
          .bind(body.email)
          .first<any>();
        if (!user) {
          return errorResponse('Invalid email or password', 401, { headers: corsHeaders });
        }
        const { hash } = await hashPassword(body.password, user.password_salt);
        if (hash !== user.password_hash) {
          return errorResponse('Invalid email or password', 401, { headers: corsHeaders });
        }
        const token = await createJwt({ sub: user.id, email: user.email }, env.SESSION_SECRET);
        delete user.password_hash;
        delete user.password_salt;
        return jsonResponse({ token, user }, { headers: corsHeaders });
      }

      const user = await requireUser(env, request);

      if (url.pathname === '/api/campaigns' && request.method === 'POST') {
        if (!user) {
          return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        }
        const body = await parseJSON<Record<string, unknown>>(request);
        if (!body || typeof body.name !== 'string') {
          return errorResponse('Missing campaign name', 400, { headers: corsHeaders });
        }
        const id = crypto.randomUUID();
        await env.MAPS_DB.prepare(
          'INSERT INTO campaigns (id, owner_id, name, description, is_public) VALUES (?, ?, ?, ?, ?)',
        ).bind(id, user.id, body.name, (body.description as string | null) || null, body.isPublic ? 1 : 0).run();
        return jsonResponse({ id, name: body.name, description: (body.description as string | null) || null, isPublic: !!body.isPublic }, { status: 201, headers: corsHeaders });
      }

      if (url.pathname === '/api/campaigns' && request.method === 'GET') {
        const isPublic = url.searchParams.get('public') === '1';
        if (isPublic) {
          const result = await env.MAPS_DB.prepare(
            'SELECT id, name, description, is_public as isPublic, created_at as createdAt FROM campaigns WHERE is_public = 1 ORDER BY created_at DESC',
          ).all();
          return jsonResponse({ campaigns: result.results }, { headers: corsHeaders });
        }
        if (!user) {
          return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        }
        const result = await env.MAPS_DB.prepare(
          'SELECT id, name, description, is_public as isPublic, created_at as createdAt FROM campaigns WHERE owner_id = ? ORDER BY created_at DESC',
        ).bind(user.id).all();
        return jsonResponse({ campaigns: result.results }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/campaigns\/[a-z0-9-]+$/) && request.method === 'DELETE') {
        if (!user) {
          return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        }
        const campaignId = url.pathname.split('/')[3];
        const ownsCampaign = await ensureCampaignOwnership(env, campaignId, user.id);
        if (!ownsCampaign) {
          return errorResponse('Campaign not found', 404, { headers: corsHeaders });
        }
        const mapKeyResults = await env.MAPS_DB.prepare(
          'SELECT original_key as originalKey, display_key as displayKey FROM maps WHERE campaign_id = ?',
        )
          .bind(campaignId)
          .all<{ originalKey: string | null; displayKey: string | null }>();
        const mapKeys = mapKeyResults.results.flatMap((record) => {
          const keys: string[] = [];
          if (record.originalKey) {
            keys.push(record.originalKey);
          }
          if (record.displayKey) {
            keys.push(record.displayKey);
          }
          return keys;
        });
        await Promise.all(mapKeys.map((key) => env.MAPS_BUCKET.delete(key)));
        await env.MAPS_DB.prepare('DELETE FROM campaigns WHERE id = ?').bind(campaignId).run();
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/campaigns\/[a-z0-9-]+\/maps$/) && request.method === 'GET') {
        if (!user) {
          return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        }
        const campaignId = url.pathname.split('/')[3];
        const ownsCampaign = await ensureCampaignOwnership(env, campaignId, user.id);
        if (!ownsCampaign) {
          return errorResponse('Campaign not found', 404, { headers: corsHeaders });
        }
        const result = await env.MAPS_DB.prepare(
          'SELECT id, campaign_id as campaignId, owner_id as ownerId, name, original_key as originalKey, display_key as displayKey, width, height, metadata FROM maps WHERE campaign_id = ? ORDER BY created_at DESC',
        ).bind(campaignId).all();
        const maps = (result.results as MapRecord[]).map((m) => ({
          ...m,
          metadata: typeof m.metadata === 'string' ? JSON.parse(m.metadata) : null,
        }));
        return jsonResponse({ maps }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/maps' && request.method === 'POST') {
        if (!user) {
          return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        }
        const body = await parseJSON<Record<string, unknown>>(request);
        if (!body || typeof body.campaignId !== 'string' || typeof body.name !== 'string' || typeof body.originalExtension !== 'string') {
          return errorResponse('Missing required fields', 400, { headers: corsHeaders });
        }
        const ownsCampaign = await ensureCampaignOwnership(env, body.campaignId, user.id);
        if (!ownsCampaign) {
          return errorResponse('Campaign not found', 404, { headers: corsHeaders });
        }
        const mapId = crypto.randomUUID();
        const originalKey = `maps/${body.campaignId}/${mapId}/original.${body.originalExtension}`;
        const displayKey = `maps/${body.campaignId}/${mapId}/display.${body.originalExtension}`;
        await env.MAPS_DB.prepare(
          'INSERT INTO maps (id, campaign_id, owner_id, name, original_key, display_key, width, height, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(
          mapId,
          body.campaignId,
          user.id,
          body.name,
          originalKey,
          displayKey,
          typeof body.width === 'number' ? body.width : null,
          typeof body.height === 'number' ? body.height : null,
          body.metadata ? JSON.stringify(body.metadata) : null,
        ).run();
        const originalUrl = await createSignedUpload(env.MAPS_BUCKET, originalKey, 'PUT', 900);
        const displayUrl = await createSignedUpload(env.MAPS_BUCKET, displayKey, 'PUT', 900);
        return jsonResponse({
          map: {
            id: mapId,
            campaignId: body.campaignId,
            name: body.name,
            originalKey,
            displayKey,
          },
          uploads: {
            original: originalUrl.toString(),
            display: displayUrl.toString(),
          },
        }, { status: 201, headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+$/) && request.method === 'GET') {
        const mapId = url.pathname.split('/')[3];
        const map = await env.MAPS_DB.prepare(
          'SELECT id, campaign_id as campaignId, owner_id as ownerId, name, original_key as originalKey, display_key as displayKey, width, height, metadata FROM maps WHERE id = ?',
        ).bind(mapId).first<MapRecord & { metadata: string | null }>();
        if (!map) {
          return errorResponse('Map not found', 404, { headers: corsHeaders });
        }
        const metadata = map.metadata ? JSON.parse(map.metadata) : null;
        return jsonResponse({ map: { ...map, metadata } }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+$/) && request.method === 'DELETE') {
        if (!user) {
          return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        }
        const mapId = url.pathname.split('/')[3];
        const ownsMap = await ensureMapOwnership(env, mapId, user.id);
        if (!ownsMap) {
          return errorResponse('Map not found', 404, { headers: corsHeaders });
        }
        const storedKeys = await env.MAPS_DB.prepare(
          'SELECT original_key as originalKey, display_key as displayKey FROM maps WHERE id = ?',
        )
          .bind(mapId)
          .first<{ originalKey: string | null; displayKey: string | null }>();
        if (!storedKeys) {
          return errorResponse('Map not found', 404, { headers: corsHeaders });
        }
        const keysToDelete = [storedKeys.originalKey, storedKeys.displayKey].filter(
          (key): key is string => typeof key === 'string' && key.length > 0,
        );
        await Promise.all(keysToDelete.map((key) => env.MAPS_BUCKET.delete(key)));
        await env.MAPS_DB.prepare('DELETE FROM maps WHERE id = ?').bind(mapId).run();
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+\/display$/) && request.method === 'GET') {
        const mapId = url.pathname.split('/')[3];
        const map = await env.MAPS_DB.prepare('SELECT display_key as displayKey FROM maps WHERE id = ?').bind(mapId).first<{ displayKey: string }>();
        if (!map?.displayKey) {
          return errorResponse('Map image not found', 404, { headers: corsHeaders });
        }
        const object = await env.MAPS_BUCKET.get(map.displayKey);
        if (!object) {
          return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        if (object.httpMetadata?.contentType) {
          headers.set('Content-Type', object.httpMetadata.contentType);
        } else {
          headers.set('Content-Type', 'image/png');
        }
        return new Response(object.body, { status: 200, headers });
      }

      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+\/regions$/)) {
        const mapId = url.pathname.split('/')[3];
        if (request.method === 'GET') {
          const result = await env.MAPS_DB.prepare(
            'SELECT id, map_id as mapId, name, polygon, notes, reveal_order as revealOrder FROM regions WHERE map_id = ? ORDER BY reveal_order ASC, created_at ASC',
          ).bind(mapId).all();
          return jsonResponse({
            regions: (result.results as RegionRecord[]).map((r) => ({
              ...r,
              polygon: typeof r.polygon === 'string' ? JSON.parse(r.polygon) : r.polygon,
            })),
          }, { headers: corsHeaders });
        }
        if (request.method === 'POST') {
          if (!user) {
            return errorResponse('Unauthorized', 401, { headers: corsHeaders });
          }
          const ownsMap = await ensureMapOwnership(env, mapId, user.id);
          if (!ownsMap) {
            return errorResponse('Map not found', 404, { headers: corsHeaders });
          }
          const body = await parseJSON<Record<string, unknown>>(request);
          if (!body || typeof body.name !== 'string' || !Array.isArray(body.polygon)) {
            return errorResponse('Invalid region', 400, { headers: corsHeaders });
          }
          const regionId = crypto.randomUUID();
          await env.MAPS_DB.prepare(
            'INSERT INTO regions (id, map_id, name, polygon, notes, reveal_order) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(
            regionId,
            mapId,
            body.name,
            JSON.stringify(body.polygon),
            (body.notes as string | null) || null,
            typeof body.revealOrder === 'number' ? body.revealOrder : null,
          ).run();
          return jsonResponse({
            region: {
              id: regionId,
              mapId,
              name: body.name,
              polygon: body.polygon,
              notes: (body.notes as string | null) || null,
              revealOrder: typeof body.revealOrder === 'number' ? body.revealOrder : null,
            },
          }, { status: 201, headers: corsHeaders });
        }
      }

      if (url.pathname.match(/^\/api\/regions\/[a-z0-9-]+$/)) {
        const regionId = url.pathname.split('/')[3];
        if (request.method === 'PUT') {
          if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
          const body = await parseJSON<Record<string, unknown>>(request);
          const existing = await env.MAPS_DB.prepare('SELECT map_id as mapId FROM regions WHERE id = ?').bind(regionId).first<{ mapId: string }>();
          if (!existing) return errorResponse('Region not found', 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap) return errorResponse('Forbidden', 403, { headers: corsHeaders });
          await env.MAPS_DB.prepare(
            'UPDATE regions SET name = ?, polygon = ?, notes = ?, reveal_order = ? WHERE id = ?',
          ).bind(
            (body?.name as string | null) || null,
            body?.polygon ? JSON.stringify(body.polygon) : JSON.stringify([]),
            (body?.notes as string | null) || null,
            typeof body?.revealOrder === 'number' ? body.revealOrder : null,
            regionId,
          ).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
        if (request.method === 'DELETE') {
          if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
          const existing = await env.MAPS_DB.prepare('SELECT map_id as mapId FROM regions WHERE id = ?').bind(regionId).first<{ mapId: string }>();
          if (!existing) return errorResponse('Region not found', 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap) return errorResponse('Forbidden', 403, { headers: corsHeaders });
          await env.MAPS_DB.prepare('DELETE FROM regions WHERE id = ?').bind(regionId).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
      }

      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+\/markers$/)) {
        const mapId = url.pathname.split('/')[3];
        if (request.method === 'GET') {
          const result = await env.MAPS_DB.prepare(
            'SELECT id, map_id as mapId, label, description, description as notes, region_id as regionId, icon_key as iconKey, x, y, color, data FROM markers WHERE map_id = ? ORDER BY created_at ASC',
          ).bind(mapId).all();
          return jsonResponse({
            markers: (result.results as MarkerRecord[]).map((m) => {
              const rawData = typeof m.data === 'string' ? JSON.parse(m.data) : m.data;
              let regionId = m.regionId && typeof m.regionId === 'string' ? m.regionId : null;
              if (!regionId && rawData && typeof rawData === 'object' && 'regionId' in rawData && rawData.regionId != null) {
                regionId = String((rawData as Record<string, unknown>).regionId);
              }
              const noteValue = m.notes ?? m.description ?? null;
              return {
                ...m,
                description: noteValue,
                notes: noteValue,
                regionId,
                data: rawData,
              };
            }),
          }, { headers: corsHeaders });
        }
        if (request.method === 'POST') {
          if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, mapId, user.id);
          if (!ownsMap) return errorResponse('Map not found', 404, { headers: corsHeaders });
          const body = await parseJSON<Record<string, unknown>>(request);
          if (!body || typeof body.label !== 'string' || typeof body.x !== 'number' || typeof body.y !== 'number') {
            return errorResponse('Invalid marker', 400, { headers: corsHeaders });
          }
          const markerId = crypto.randomUUID();
          const noteValue =
            typeof body.notes === 'string'
              ? body.notes
              : (body.description as string | null) || null;
          let regionId: string | null = null;
          if (body.regionId !== undefined) {
            if (body.regionId === null) {
              regionId = null;
            } else if (typeof body.regionId === 'string') {
              regionId = body.regionId;
            } else {
              regionId = String(body.regionId);
            }
          }
          if (regionId) {
            const region = await env.MAPS_DB.prepare('SELECT id FROM regions WHERE id = ? AND map_id = ?')
              .bind(regionId, mapId)
              .first();
            if (!region) {
              return errorResponse('Invalid region', 400, { headers: corsHeaders });
            }
          }
          await env.MAPS_DB.prepare(
            'INSERT INTO markers (id, map_id, label, description, icon_key, x, y, color, data, region_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          ).bind(
            markerId,
            mapId,
            body.label,
            noteValue,
            (body.iconKey as string | null) || null,
            body.x,
            body.y,
            (body.color as string | null) || null,
            body.data ? JSON.stringify(body.data) : null,
            regionId,
          ).run();
          return jsonResponse({
            marker: {
              id: markerId,
              mapId,
              label: body.label,
              description: noteValue,
              iconKey: (body.iconKey as string | null) || null,
              x: body.x,
              y: body.y,
              color: (body.color as string | null) || null,
              data: body.data || null,
              notes: noteValue,
              regionId,
            },
          }, { status: 201, headers: corsHeaders });
        }
      }

      if (url.pathname.match(/^\/api\/markers\/[a-z0-9-]+$/)) {
        const markerId = url.pathname.split('/')[3];
        if (request.method === 'PUT') {
          if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
          const existing = await env.MAPS_DB.prepare('SELECT map_id as mapId, description, region_id as regionId FROM markers WHERE id = ?')
            .bind(markerId)
            .first<{ mapId: string; description: string | null; regionId: string | null }>();
          if (!existing) return errorResponse('Marker not found', 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap) return errorResponse('Forbidden', 403, { headers: corsHeaders });
          const body = await parseJSON<Record<string, unknown>>(request);
          const noteValue = (() => {
            if (typeof body?.notes === 'string') return body.notes;
            if (body?.notes === null) return null;
            if (typeof body?.description === 'string') return body.description;
            if (body?.description === null) return null;
            return existing.description;
          })();
          let regionId = existing.regionId ?? null;
          if (body?.regionId !== undefined) {
            if (body.regionId === null) {
              regionId = null;
            } else if (typeof body.regionId === 'string') {
              regionId = body.regionId;
            } else {
              regionId = String(body.regionId);
            }
          }
          if (regionId) {
            const region = await env.MAPS_DB.prepare('SELECT id FROM regions WHERE id = ? AND map_id = ?')
              .bind(regionId, existing.mapId)
              .first();
            if (!region) {
              return errorResponse('Invalid region', 400, { headers: corsHeaders });
            }
          }
          await env.MAPS_DB.prepare(
            'UPDATE markers SET label = ?, description = ?, icon_key = ?, x = ?, y = ?, color = ?, data = ?, region_id = ? WHERE id = ?',
          ).bind(
            (body?.label as string | null) || null,
            noteValue,
            (body?.iconKey as string | null) || null,
            typeof body?.x === 'number' ? body.x : null,
            typeof body?.y === 'number' ? body.y : null,
            (body?.color as string | null) || null,
            body?.data ? JSON.stringify(body.data) : null,
            regionId,
            markerId,
          ).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
        if (request.method === 'DELETE') {
          if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
          const existing = await env.MAPS_DB.prepare('SELECT map_id as mapId FROM markers WHERE id = ?').bind(markerId).first<{ mapId: string }>();
          if (!existing) return errorResponse('Marker not found', 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap) return errorResponse('Forbidden', 403, { headers: corsHeaders });
          await env.MAPS_DB.prepare('DELETE FROM markers WHERE id = ?').bind(markerId).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
      }

      if (url.pathname === '/api/assets/marker' && request.method === 'POST') {
        if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        const body = await parseJSON<Record<string, unknown>>(request);
        const fileName = (body?.fileName as string) || `${crypto.randomUUID()}.png`;
        const key = `assets/${user.id}/${fileName}`;
        const uploadUrl = await createSignedUpload(env.MAPS_BUCKET, key, 'PUT', 900);
        await env.MAPS_DB.prepare('INSERT INTO assets (id, owner_id, key, type) VALUES (?, ?, ?, ?)')
          .bind(crypto.randomUUID(), user.id, key, 'marker').run();
        return jsonResponse({ key, uploadUrl: uploadUrl.toString() }, { status: 201, headers: corsHeaders });
      }

      if (url.pathname.startsWith('/api/assets/marker/') && request.method === 'GET') {
        const key = decodeURIComponent(url.pathname.replace('/api/assets/marker/', ''));
        const object = await env.MAPS_BUCKET.get(key);
        if (!object) {
          return new Response('Not found', { status: 404, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        if (object.httpMetadata?.contentType) {
          headers.set('Content-Type', object.httpMetadata.contentType);
        }
        return new Response(object.body, {
          status: 200,
          headers,
        });
      }

      if (url.pathname === '/api/sessions' && request.method === 'POST') {
        if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        const body = await parseJSON<Record<string, unknown>>(request);
        if (!body || typeof body.campaignId !== 'string' || typeof body.mapId !== 'string' || typeof body.name !== 'string') {
          return errorResponse('Missing session fields', 400, { headers: corsHeaders });
        }
        const ownsCampaign = await ensureCampaignOwnership(env, body.campaignId, user.id);
        const ownsMap = await ensureMapOwnership(env, body.mapId, user.id);
        if (!ownsCampaign || !ownsMap) {
          return errorResponse('Invalid campaign or map', 400, { headers: corsHeaders });
        }
        const sessionId = crypto.randomUUID();
        await env.MAPS_DB.prepare(
          'INSERT INTO sessions (id, campaign_id, map_id, host_id, name, status) VALUES (?, ?, ?, ?, ?, ?)',
        ).bind(sessionId, body.campaignId, body.mapId, user.id, body.name, 'active').run();
        const stub = await getSessionStub(env, sessionId);
        await stub.fetch('https://session/setup', {
          method: 'POST',
          body: JSON.stringify({
            sessionId,
            campaignId: body.campaignId,
            mapId: body.mapId,
            hostId: user.id,
            name: body.name,
            metadata: body.metadata || {},
          }),
        });
        return jsonResponse({ session: { id: sessionId, campaignId: body.campaignId, mapId: body.mapId, name: body.name, status: 'active' } }, { status: 201, headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+$/) && request.method === 'GET') {
        const sessionId = url.pathname.split('/')[3];
        const session = await env.MAPS_DB.prepare(
          `SELECT s.id, s.name, s.status, s.campaign_id as campaignId, s.map_id as mapId, s.host_id as hostId,
                  s.created_at as createdAt, s.ended_at as endedAt,
                  c.name as campaignName, m.name as mapName
           FROM sessions s
           LEFT JOIN campaigns c ON s.campaign_id = c.id
           LEFT JOIN maps m ON s.map_id = m.id
           WHERE s.id = ?`,
        ).bind(sessionId).first();
        if (!session) {
          return errorResponse('Session not found', 404, { headers: corsHeaders });
        }
        return jsonResponse({ session }, { headers: corsHeaders });
      }

      if (url.pathname === '/api/lobby' && request.method === 'GET') {
        const query = `
          SELECT s.id, s.name, s.status, s.campaign_id as campaignId, s.map_id as mapId, s.created_at as createdAt,
                 s.host_id as hostId,
                 c.name as campaignName, m.name as mapName
          FROM sessions s
          LEFT JOIN campaigns c ON s.campaign_id = c.id
          LEFT JOIN maps m ON s.map_id = m.id
          WHERE s.status = 'active'
          ORDER BY s.created_at DESC
        `;
        const result = await env.MAPS_DB.prepare(query).all();
        return jsonResponse({ sessions: result.results }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/save$/) && request.method === 'POST') {
        if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        const sessionId = url.pathname.split('/')[3];
        const session = await env.MAPS_DB.prepare('SELECT id, campaign_id as campaignId FROM sessions WHERE id = ? AND host_id = ?')
          .bind(sessionId, user.id).first<{ id: string; campaignId: string }>();
        if (!session) return errorResponse('Session not found', 404, { headers: corsHeaders });
        const stub = await getSessionStub(env, sessionId);
        const stateResp = await stub.fetch('https://session/state');
        const state = await stateResp.json();
        const now = new Date();
        const yyyy = now.getUTCFullYear();
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(now.getUTCDate()).padStart(2, '0');
        const hhmmss = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`;
        const key = `backups/${session.campaignId}/${yyyy}/${mm}/${dd}/${hhmmss}.json`;
        await env.MAPS_BUCKET.put(key, JSON.stringify(state), { httpMetadata: { contentType: 'application/json' } });
        return jsonResponse({ backupKey: key }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/end$/) && request.method === 'POST') {
        if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        const sessionId = url.pathname.split('/')[3];
        const session = await env.MAPS_DB.prepare('SELECT id FROM sessions WHERE id = ? AND host_id = ?')
          .bind(sessionId, user.id).first<{ id: string }>();
        if (!session) return errorResponse('Session not found', 404, { headers: corsHeaders });
        await env.MAPS_DB.prepare("UPDATE sessions SET status = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
          .bind('ended', sessionId).run();
        const stub = await getSessionStub(env, sessionId);
        await stub.fetch('https://session/end', { method: 'POST' });
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }

      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/restore$/) && request.method === 'POST') {
        if (!user) return errorResponse('Unauthorized', 401, { headers: corsHeaders });
        const sessionId = url.pathname.split('/')[3];
        const body = await parseJSON<Record<string, unknown>>(request);
        if (!body?.backupKey) return errorResponse('Missing backupKey', 400, { headers: corsHeaders });
        const session = await env.MAPS_DB.prepare('SELECT id, host_id FROM sessions WHERE id = ?')
          .bind(sessionId).first<{ id: string; host_id: string }>();
        if (!session || session.host_id !== user.id) return errorResponse('Session not found', 404, { headers: corsHeaders });
        const object = await env.MAPS_BUCKET.get(body.backupKey as string);
        if (!object) return errorResponse('Backup not found', 404, { headers: corsHeaders });
        const state = await object.json();
        const stub = await getSessionStub(env, sessionId);
        await stub.fetch('https://session/restore', { method: 'POST', body: JSON.stringify({ state, clone: !!body.clone }) });
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }

      return new Response('Not found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('API error', err);
      return errorResponse('Internal Server Error', 500, { headers: corsHeaders });
    }
  },
};
