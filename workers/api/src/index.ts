var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var textEncoder = new TextEncoder();
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(bufferToHex, "bufferToHex");
function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
__name(encodeRfc3986, "encodeRfc3986");
function buildCanonicalQuery(params) {
  return Object.keys(params).sort().map((key) => `${encodeRfc3986(key)}=${encodeRfc3986(params[key])}`).join("&");
}
__name(buildCanonicalQuery, "buildCanonicalQuery");
async function sha256Hex(value) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bufferToHex(hashBuffer);
}
__name(sha256Hex, "sha256Hex");
async function hmacSha256(key, data) {
  const keyBytes = typeof key === "string" ? textEncoder.encode(key) : key instanceof Uint8Array ? key : new Uint8Array(key);
  const rawKey = keyBytes.byteOffset === 0 && keyBytes.byteLength === keyBytes.buffer.byteLength ? keyBytes.buffer : keyBytes.buffer.slice(keyBytes.byteOffset, keyBytes.byteOffset + keyBytes.byteLength);
  const cryptoKey = await crypto.subtle.importKey("raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, textEncoder.encode(data));
}
__name(hmacSha256, "hmacSha256");
function resolveBucketName(bucket) {
  // Accept a literal string or try well-known props; bindings often expose neither.
  if (typeof bucket === "string" && bucket) return bucket;
  const candidates = ["bucketName", "name"];
  const bucketRecord = bucket || {};
  for (const candidate of candidates) {
    const value = bucketRecord[candidate];
    if (typeof value === "string" && value) return value;
  }
  return null;
}
__name(resolveBucketName, "resolveBucketName");
async function createR2PresignedUrl(env, bucket, key, method, expiration) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 signing secrets in environment");
  }
  const bucketName = resolveBucketName(bucket) || env.MAPS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("Unable to resolve bucket name for R2 presigned URL (set MAPS_BUCKET_NAME)");
  }
  const safeExpiration = Math.min(Math.max(Math.floor(expiration), 1), 60 * 60 * 24 * 7);
  const now = /* @__PURE__ */ new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const region = "auto";
  const service = "s3";
  const credentialScope = `${shortDate}/${region}/${service}/aws4_request`;
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const keySegments = key.split("/").map(encodeRfc3986);
  const canonicalUri = `/${[encodeRfc3986(bucketName), ...keySegments].join("/")}`;
  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(safeExpiration),
    "X-Amz-SignedHeaders": "host"
  };
  const canonicalQuery = buildCanonicalQuery(queryParams);
  const canonicalHeaders = `host:${host}
`;
  const signedHeaders = "host";
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");
  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashedCanonicalRequest].join("\n");
  const kDate = await hmacSha256(`AWS4${R2_SECRET_ACCESS_KEY}`, shortDate);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = bufferToHex(await hmacSha256(kSigning, stringToSign));
  const signedQuery = buildCanonicalQuery({
    ...queryParams,
    "X-Amz-Signature": signature
  });
  return `https://${host}${canonicalUri}?${signedQuery}`;
}
__name(createR2PresignedUrl, "createR2PresignedUrl");
function jsonResponse(data, init = {}) {
  const { headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Access-Control-Allow-Origin")) {
    headers.set("Access-Control-Allow-Origin", "*");
  }
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  const responseInit = {
    ...rest,
    headers
  };
  return new Response(JSON.stringify(data), responseInit);
}
__name(jsonResponse, "jsonResponse");
function errorResponse(message, status = 400, init = {}, extra = {}) {
  return jsonResponse({ error: message, ...extra }, { ...init, status });
}
__name(errorResponse, "errorResponse");
async function parseJSON(request) {
  try {
    return await request.json();
  } catch (err) {
    console.error("Failed to parse JSON body", err);
    return null;
  }
}
__name(parseJSON, "parseJSON");
function base64UrlEncode(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let string = "";
  bytes.forEach((b) => {
    string += String.fromCharCode(b);
  });
  return btoa(string).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(str) {
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = pad ? normalized + "=".repeat(4 - pad) : normalized;
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
}
__name(base64UrlDecode, "base64UrlDecode");
function decodeBase64DataUrl(dataUrl) {
  if (typeof dataUrl !== "string")
    return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match)
    return null;
  try {
    const [, mimeType, base64Data] = match;
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return { mimeType, bytes };
  } catch (error) {
    console.error("Failed to decode base64 data URL", error);
    return null;
  }
}
__name(decodeBase64DataUrl, "decodeBase64DataUrl");
function encodeBytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
__name(encodeBytesToBase64, "encodeBytesToBase64");
function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object")
    return null;
  const minX = Number(bounds.minX);
  const minY = Number(bounds.minY);
  const maxX = Number(bounds.maxX);
  const maxY = Number(bounds.maxY);
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY))
    return null;
  return { minX, minY, maxX, maxY };
}
__name(normalizeBounds, "normalizeBounds");
function normalizeMaskManifest(regionId, maskPayload, manifestPayload) {
  if (manifestPayload === null)
    return null;
  const source = typeof manifestPayload === "object" && manifestPayload ? manifestPayload : {};
  const manifest = {
    roomId: typeof source.roomId === "string" && source.roomId.length > 0 ? source.roomId : regionId,
    key: typeof source.key === "string" && source.key.length > 0 ? source.key : `room-masks/${regionId}.png`
  };
  const widthSource = maskPayload && typeof maskPayload === "object" && maskPayload.width !== void 0 ? maskPayload.width : source.width;
  const heightSource = maskPayload && typeof maskPayload === "object" && maskPayload.height !== void 0 ? maskPayload.height : source.height;
  const width = Number(widthSource);
  const height = Number(heightSource);
  if (Number.isFinite(width)) {
    manifest.width = width;
  }
  if (Number.isFinite(height)) {
    manifest.height = height;
  }
  const bounds = normalizeBounds(maskPayload && typeof maskPayload === "object" && maskPayload.bounds ? maskPayload.bounds : source.bounds);
  if (bounds) {
    manifest.bounds = bounds;
  }
  for (const [key, value] of Object.entries(source)) {
    if (key === "dataUrl" || key === "roomId" || key === "key" || key === "width" || key === "height" || key === "bounds")
      continue;
    if (value !== void 0) {
      manifest[key] = value;
    }
  }
  return manifest;
}
__name(normalizeMaskManifest, "normalizeMaskManifest");
function prepareMaskManifest(regionId, maskPayload, manifestPayload) {
  if (maskPayload === void 0 && manifestPayload === void 0)
    return { manifest: void 0, pngBytes: null };
  if (manifestPayload === null)
    return { manifest: null, pngBytes: null };
  const manifest = normalizeMaskManifest(regionId, maskPayload, manifestPayload);
  if (!manifest)
    return { manifest: void 0, pngBytes: null };
  if (!maskPayload || typeof maskPayload !== "object" || typeof maskPayload.dataUrl !== "string") {
    return { manifest, pngBytes: null };
  }
  const decoded = decodeBase64DataUrl(maskPayload.dataUrl);
  if (!decoded)
    return { error: "Invalid mask image data", manifest: void 0, pngBytes: null };
  if (decoded.mimeType && decoded.mimeType !== "image/png") {
    return { error: "Mask image must be a PNG", manifest: void 0, pngBytes: null };
  }
  return { manifest, pngBytes: decoded.bytes };
}
__name(prepareMaskManifest, "prepareMaskManifest");
async function loadMaskData(env, manifest) {
  if (!manifest || typeof manifest !== "object")
    return null;
  const key = typeof manifest.key === "string" ? manifest.key : null;
  if (!key)
    return null;
  try {
    const object = await env.MAPS_BUCKET.get(key);
    if (!object)
      return null;
    const arrayBuffer = await object.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64 = encodeBytesToBase64(bytes);
    const mimeType = object.httpMetadata?.contentType || "image/png";
    const response = {
      dataUrl: `data:${mimeType};base64,${base64}`
    };
    if (manifest.bounds)
      response.bounds = manifest.bounds;
    return response;
  } catch (error) {
    console.error("Failed to load mask image from bucket", error);
    return null;
  }
}
__name(loadMaskData, "loadMaskData");
function normalizeOptionalText(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value === null)
    return null;
  return null;
}
__name(normalizeOptionalText, "normalizeOptionalText");
function normalizeTagsValue(value) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => typeof entry === "string" ? entry.trim() : String(entry ?? "").trim())
      .filter((entry) => entry.length > 0);
    if (!normalized.length)
      return null;
    return normalized.join(", ");
  }
  return normalizeOptionalText(value);
}
__name(normalizeTagsValue, "normalizeTagsValue");
function parseBooleanFlag(value) {
  if (value === true || value === 1)
    return 1;
  if (value === false || value === 0)
    return 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized)
      return 0;
    if (["true", "1", "yes", "y"].includes(normalized))
      return 1;
    if (["false", "0", "no", "n"].includes(normalized))
      return 0;
  }
  return 0;
}
__name(parseBooleanFlag, "parseBooleanFlag");
function booleanFromStorage(value) {
  if (value === true || value === false)
    return value;
  if (typeof value === "number")
    return value > 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized)
      return false;
    return ["true", "1", "yes", "y"].includes(normalized);
  }
  return false;
}
__name(booleanFromStorage, "booleanFromStorage");
async function hashPassword(password, salt) {
  const saltBytes = salt ? base64UrlDecode(salt) : crypto.getRandomValues(new Uint8Array(16));
  const combined = new Uint8Array(saltBytes.length + password.length);
  combined.set(saltBytes, 0);
  combined.set(textEncoder.encode(password), saltBytes.length);
  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return {
    salt: base64UrlEncode(saltBytes),
    hash: base64UrlEncode(hashBuffer)
  };
}
__name(hashPassword, "hashPassword");
async function createJwt(payload, secret, expiresInSeconds = 60 * 60 * 24 * 30) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1e3);
  const exp = now + expiresInSeconds;
  const data = { ...payload, iat: now, exp };
  const encodedHeader = base64UrlEncode(textEncoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(textEncoder.encode(JSON.stringify(data)));
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  const signature = base64UrlEncode(signatureBuffer);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
__name(createJwt, "createJwt");
async function verifyJwt(token, secret) {
  if (!token)
    return null;
  const parts = token.split(".");
  if (parts.length !== 3)
    return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload)));
  } catch (err) {
    console.error("Failed to decode JWT payload", err);
    return null;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signature),
    textEncoder.encode(`${encodedHeader}.${encodedPayload}`)
  );
  if (!valid)
    return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1e3)) {
    return null;
  }
  return payload;
}
__name(verifyJwt, "verifyJwt");
async function requireUser(env, request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return null;
  }
  const token = authHeader.replace(/Bearer\s+/i, "").trim();
  const payload = await verifyJwt(token, env.SESSION_SECRET);
  if (!payload?.sub)
    return null;
  const stmt = env.MAPS_DB.prepare("SELECT id, email, display_name as displayName FROM users WHERE id = ?");
  const result = await stmt.bind(payload.sub).first();
  return result || null;
}
__name(requireUser, "requireUser");
function createCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin"
  };
}
__name(createCorsHeaders, "createCorsHeaders");
async function ensureCampaignOwnership(env, campaignId, userId) {
  const stmt = env.MAPS_DB.prepare("SELECT id FROM campaigns WHERE id = ? AND owner_id = ?");
  const result = await stmt.bind(campaignId, userId).first();
  return !!result;
}
__name(ensureCampaignOwnership, "ensureCampaignOwnership");
async function ensureMapOwnership(env, mapId, userId) {
  const stmt = env.MAPS_DB.prepare("SELECT id FROM maps WHERE id = ? AND owner_id = ?");
  const result = await stmt.bind(mapId, userId).first();
  return !!result;
}
__name(ensureMapOwnership, "ensureMapOwnership");
async function createSignedUpload(env, bucket, key, method = "PUT", expiration = 900) {
  if (!bucket || typeof bucket !== "object") {
    console.error("R2 bucket binding missing or invalid", { type: typeof bucket, key });
    throw new Error("R2 bucket binding missing or invalid");
  }
  const typedBucket = bucket;
  const createSignedUrl = typedBucket.createSignedUrl;
  if (typeof createSignedUrl !== "function") {
    try {
      return await createR2PresignedUrl(env, env.MAPS_BUCKET_NAME || typedBucket, key, method, expiration);
    } catch (err) {
      console.error("Failed to create fallback R2 presigned URL", {
        key,
        method,
        expiration,
        errorName: err?.name,
        errorMessage: err?.message,
        errorStack: err?.stack,
      });
      throw err;
    }    
  }
  try {
    return await createSignedUrl.call(typedBucket, {
      key,
      method,
      expiration
    });
  } catch (err) {
    console.error("Failed to create signed URL", {
      key, method, expiration,
      errorName: err?.name,
      errorMessage: err?.message,
      errorStack: err?.stack,
    });
    throw err;
  }  
}
__name(createSignedUpload, "createSignedUpload");
async function getSessionStub(env, sessionId) {
  const id = env.SESSION_HUB.idFromName(sessionId);
  return env.SESSION_HUB.get(id);
}
__name(getSessionStub, "getSessionStub");
var src_default = {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const corsHeaders = createCorsHeaders(request);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }
    if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/ws$/) && request.headers.get("Upgrade") === "websocket") {
      const sessionId = url.pathname.split("/")[3];
      const stub = await getSessionStub(env, sessionId);
      return stub.fetch(request);
    }
    try {
      if (url.pathname === "/api/auth/signup" && request.method === "POST") {
        const body = await parseJSON(request);
        if (!body || !body.email || !body.password || !body.displayName) {
          return errorResponse("Missing required fields", 400, { headers: corsHeaders });
        }
        const existing = await env.MAPS_DB.prepare("SELECT id FROM users WHERE email = ?").bind(body.email).first();
        if (existing) {
          return errorResponse("Email already registered", 409, { headers: corsHeaders });
        }
        const { salt, hash } = await hashPassword(body.password);
        const userId = crypto.randomUUID();
        await env.MAPS_DB.prepare(
          "INSERT INTO users (id, email, display_name, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)"
        ).bind(userId, body.email, body.displayName, hash, salt).run();
        const token = await createJwt({ sub: userId, email: body.email }, env.SESSION_SECRET);
        return jsonResponse({
          token,
          user: { id: userId, email: body.email, displayName: body.displayName }
        }, { status: 201, headers: corsHeaders });
      }
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const body = await parseJSON(request);
        if (!body || !body.email || !body.password) {
          return errorResponse("Missing credentials", 400, { headers: corsHeaders });
        }
        const user2 = await env.MAPS_DB.prepare("SELECT id, email, display_name as displayName, password_hash, password_salt FROM users WHERE email = ?").bind(body.email).first();
        if (!user2) {
          return errorResponse("Invalid email or password", 401, { headers: corsHeaders });
        }
        const { hash } = await hashPassword(body.password, user2.password_salt);
        if (hash !== user2.password_hash) {
          return errorResponse("Invalid email or password", 401, { headers: corsHeaders });
        }
        const token = await createJwt({ sub: user2.id, email: user2.email }, env.SESSION_SECRET);
        delete user2.password_hash;
        delete user2.password_salt;
        return jsonResponse({ token, user: user2 }, { headers: corsHeaders });
      }
      const user = await requireUser(env, request);
      if (url.pathname === "/api/campaigns" && request.method === "POST") {
        if (!user) {
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        }
        const body = await parseJSON(request);
        if (!body || typeof body.name !== "string") {
          return errorResponse("Missing campaign name", 400, { headers: corsHeaders });
        }
        const id = crypto.randomUUID();
        await env.MAPS_DB.prepare(
          "INSERT INTO campaigns (id, owner_id, name, description, is_public) VALUES (?, ?, ?, ?, ?)"
        ).bind(id, user.id, body.name, body.description || null, body.isPublic ? 1 : 0).run();
        return jsonResponse({ id, name: body.name, description: body.description || null, isPublic: !!body.isPublic }, { status: 201, headers: corsHeaders });
      }
      if (url.pathname === "/api/campaigns" && request.method === "GET") {
        const isPublic = url.searchParams.get("public") === "1";
        if (isPublic) {
          const result2 = await env.MAPS_DB.prepare(
            "SELECT id, name, description, is_public as isPublic, created_at as createdAt FROM campaigns WHERE is_public = 1 ORDER BY created_at DESC"
          ).all();
          return jsonResponse({ campaigns: result2.results }, { headers: corsHeaders });
        }
        if (!user) {
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        }
        const result = await env.MAPS_DB.prepare(
          "SELECT id, name, description, is_public as isPublic, created_at as createdAt FROM campaigns WHERE owner_id = ? ORDER BY created_at DESC"
        ).bind(user.id).all();
        return jsonResponse({ campaigns: result.results }, { headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/campaigns\/[a-z0-9-]+$/) && request.method === "DELETE") {
        if (!user) {
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        }
        const campaignId = url.pathname.split("/")[3];
        const ownsCampaign = await ensureCampaignOwnership(env, campaignId, user.id);
        if (!ownsCampaign) {
          return errorResponse("Campaign not found", 404, { headers: corsHeaders });
        }
        const mapKeyResults = await env.MAPS_DB.prepare(
          "SELECT original_key as originalKey, display_key as displayKey FROM maps WHERE campaign_id = ?"
        ).bind(campaignId).all();
        const mapKeys = mapKeyResults.results.flatMap((record) => {
          const keys = [];
          if (record.originalKey) {
            keys.push(record.originalKey);
          }
          if (record.displayKey) {
            keys.push(record.displayKey);
          }
          return keys;
        });
        await Promise.all(mapKeys.map((key) => env.MAPS_BUCKET.delete(key)));
        await env.MAPS_DB.prepare("DELETE FROM campaigns WHERE id = ?").bind(campaignId).run();
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/campaigns\/[a-z0-9-]+\/maps$/) && request.method === "GET") {
        if (!user) {
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        }
        const campaignId = url.pathname.split("/")[3];
        const ownsCampaign = await ensureCampaignOwnership(env, campaignId, user.id);
        if (!ownsCampaign) {
          return errorResponse("Campaign not found", 404, { headers: corsHeaders });
        }
        const result = await env.MAPS_DB.prepare(
          "SELECT id, campaign_id as campaignId, owner_id as ownerId, name, original_key as originalKey, display_key as displayKey, width, height, metadata FROM maps WHERE campaign_id = ? ORDER BY created_at DESC"
        ).bind(campaignId).all();
        const maps = result.results.map((m) => ({
          ...m,
          metadata: typeof m.metadata === "string" ? JSON.parse(m.metadata) : null
        }));
        return jsonResponse({ maps }, { headers: corsHeaders });
      }
      if (url.pathname === "/api/maps" && request.method === "POST") {
        if (!user) {
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        }
        const body = await parseJSON(request);
        if (!body || typeof body.campaignId !== "string" || typeof body.name !== "string" || typeof body.originalExtension !== "string") {
          return errorResponse("Missing required fields", 400, { headers: corsHeaders });
        }
        const ownsCampaign = await ensureCampaignOwnership(env, body.campaignId, user.id);
        if (!ownsCampaign) {
          return errorResponse("Campaign not found", 404, { headers: corsHeaders });
        }
        const mapId = crypto.randomUUID();
        const originalKey = `maps/${body.campaignId}/${mapId}/original.${body.originalExtension}`;
        const displayKey = `maps/${body.campaignId}/${mapId}/display.${body.originalExtension}`;
        await env.MAPS_DB.prepare(
          "INSERT INTO maps (id, campaign_id, owner_id, name, original_key, display_key, width, height, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          mapId,
          body.campaignId,
          user.id,
          body.name,
          originalKey,
          displayKey,
          typeof body.width === "number" ? body.width : null,
          typeof body.height === "number" ? body.height : null,
          body.metadata ? JSON.stringify(body.metadata) : null
        ).run();
        const originalUrl = await createSignedUpload(env, env.MAPS_BUCKET, originalKey, "PUT", 900);
        const displayUrl = await createSignedUpload(env, env.MAPS_BUCKET, displayKey, "PUT", 900);
        return jsonResponse({
          map: {
            id: mapId,
            campaignId: body.campaignId,
            name: body.name,
            originalKey,
            displayKey
          },
          uploads: {
            original: originalUrl.toString(),
            display: displayUrl.toString()
          }
        }, { status: 201, headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+$/) && request.method === "GET") {
        const mapId = url.pathname.split("/")[3];
        const map = await env.MAPS_DB.prepare(
          "SELECT id, campaign_id as campaignId, owner_id as ownerId, name, original_key as originalKey, display_key as displayKey, width, height, metadata FROM maps WHERE id = ?"
        ).bind(mapId).first();
        if (!map) {
          return errorResponse("Map not found", 404, { headers: corsHeaders });
        }
        const metadata = map.metadata ? JSON.parse(map.metadata) : null;
        return jsonResponse({ map: { ...map, metadata } }, { headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+$/) && request.method === "DELETE") {
        if (!user) {
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        }
        const mapId = url.pathname.split("/")[3];
        const ownsMap = await ensureMapOwnership(env, mapId, user.id);
        if (!ownsMap) {
          return errorResponse("Map not found", 404, { headers: corsHeaders });
        }
        const storedKeys = await env.MAPS_DB.prepare(
          "SELECT original_key as originalKey, display_key as displayKey FROM maps WHERE id = ?"
        ).bind(mapId).first();
        if (!storedKeys) {
          return errorResponse("Map not found", 404, { headers: corsHeaders });
        }
        const keysToDelete = [storedKeys.originalKey, storedKeys.displayKey].filter(
          (key) => typeof key === "string" && key.length > 0
        );
        await Promise.all(keysToDelete.map((key) => env.MAPS_BUCKET.delete(key)));
        await env.MAPS_DB.prepare("DELETE FROM maps WHERE id = ?").bind(mapId).run();
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+\/display$/) && request.method === "GET") {
        const mapId = url.pathname.split("/")[3];
        const map = await env.MAPS_DB.prepare("SELECT display_key as displayKey FROM maps WHERE id = ?").bind(mapId).first();
        if (!map?.displayKey) {
          return errorResponse("Map image not found", 404, { headers: corsHeaders });
        }
        const object = await env.MAPS_BUCKET.get(map.displayKey);
        if (!object) {
          return new Response("Not found", { status: 404, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        if (object.httpMetadata?.contentType) {
          headers.set("Content-Type", object.httpMetadata.contentType);
        } else {
          headers.set("Content-Type", "image/png");
        }
        return new Response(object.body, { status: 200, headers });
      }
      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+\/regions$/)) {
        const mapId = url.pathname.split("/")[3];
        if (request.method === "GET") {
          const result = await env.MAPS_DB.prepare(
            "SELECT id, map_id as mapId, name, notes, reveal_order as revealOrder, mask_manifest as maskManifest, color, description, tags, visible_at_start as visibleAtStart FROM regions WHERE map_id = ? ORDER BY reveal_order ASC, created_at ASC"
          ).bind(mapId).all();
          const regions = await Promise.all(
            result.results.map(async (r) => {
              let manifest = r.maskManifest;
              if (typeof manifest === "string") {
                try {
                  manifest = JSON.parse(manifest);
                } catch (err) {
                  console.error("Failed to parse region mask manifest", err);
                  manifest = null;
                }
              }
              const mask = await loadMaskData(env, manifest);
              return {
                id: r.id,
                mapId: r.mapId,
                name: r.name,
                notes: r.notes,
                revealOrder: r.revealOrder,
                maskManifest: manifest ?? null,
                mask,
                color:
                  typeof r.color === "string"
                    ? r.color.trim().length > 0
                      ? r.color.trim().toLowerCase()
                      : null
                    : r.color ?? null,
                description: normalizeOptionalText(r.description ?? null),
                tags: normalizeTagsValue(r.tags ?? null),
                visibleAtStart: booleanFromStorage(r.visibleAtStart)
              };
            })
          );
          return jsonResponse({ regions }, { headers: corsHeaders });
        }
        if (request.method === "POST") {
          if (!user) {
            return errorResponse("Unauthorized", 401, { headers: corsHeaders });
          }
          const ownsMap = await ensureMapOwnership(env, mapId, user.id);
          if (!ownsMap) {
            return errorResponse("Map not found", 404, { headers: corsHeaders });
          }
          const body = await parseJSON(request);
          if (
            !body ||
            typeof body.name !== "string" ||
            !body.mask ||
            typeof body.mask !== "object" ||
            typeof body.mask.dataUrl !== "string"
          ) {
            return errorResponse("Invalid region", 400, { headers: corsHeaders });
          }
          const regionId = crypto.randomUUID();
          const maskPreparation = prepareMaskManifest(regionId, body?.mask, body?.maskManifest);
          if (maskPreparation.error) {
            return errorResponse(maskPreparation.error, 400, { headers: corsHeaders });
          }
          if (maskPreparation.pngBytes && maskPreparation.manifest?.key) {
            await env.MAPS_BUCKET.put(maskPreparation.manifest.key, maskPreparation.pngBytes, {
              httpMetadata: { contentType: "image/png" }
            });
          }
          const manifestObject = maskPreparation.manifest ?? null;
          const normalizedColor = typeof body.color === "string" && body.color.trim().length > 0 ? body.color.trim().toLowerCase() : null;
          const normalizedDescription = normalizeOptionalText(body?.description);
          const normalizedTags = normalizeTagsValue(body?.tags);
          const visibleAtStartFlag = parseBooleanFlag(body?.visibleAtStart);
          await env.MAPS_DB.prepare(
            "INSERT INTO regions (id, map_id, name, notes, reveal_order, mask_manifest, color, description, tags, visible_at_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            regionId,
            mapId,
            body.name,
            body.notes || null,
            typeof body.revealOrder === "number" ? body.revealOrder : null,
            manifestObject ? JSON.stringify(manifestObject) : null,
            normalizedColor,
            normalizedDescription,
            normalizedTags,
            visibleAtStartFlag
          ).run();
          const maskBounds = maskPreparation.manifest?.bounds ?? (body.mask?.bounds ?? null);
          return jsonResponse({
            region: {
              id: regionId,
              mapId,
              name: body.name,
              notes: body.notes || null,
              revealOrder: typeof body.revealOrder === "number" ? body.revealOrder : null,
              mask: {
                dataUrl: body.mask.dataUrl,
                ...(maskBounds ? { bounds: maskBounds } : {}),
              },
              maskManifest: manifestObject,
              color: normalizedColor,
              description: normalizedDescription,
              tags: normalizedTags,
              visibleAtStart: visibleAtStartFlag === 1
            }
          }, { status: 201, headers: corsHeaders });
        }
      }
      if (url.pathname.match(/^\/api\/regions\/[a-z0-9-]+$/)) {
        const regionId = url.pathname.split("/")[3];
        if (request.method === "PUT") {
          if (!user)
            return errorResponse("Unauthorized", 401, { headers: corsHeaders });
          const body = await parseJSON(request);
          const existing = await env.MAPS_DB.prepare("SELECT map_id as mapId, mask_manifest as maskManifest FROM regions WHERE id = ?").bind(regionId).first();
          if (!existing)
            return errorResponse("Region not found", 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap)
            return errorResponse("Forbidden", 403, { headers: corsHeaders });
          let parsedExistingManifest = null;
          if (typeof existing.maskManifest === "string") {
            try {
              parsedExistingManifest = JSON.parse(existing.maskManifest);
            } catch (err) {
              console.error("Failed to parse existing mask manifest", err);
              parsedExistingManifest = null;
            }
          }
          const maskPreparation = prepareMaskManifest(regionId, body?.mask, body?.maskManifest);
          if (maskPreparation.error) {
            return errorResponse(maskPreparation.error, 400, { headers: corsHeaders });
          }
          let manifestObject = parsedExistingManifest;
          let manifestJson = existing.maskManifest ?? null;
          if (maskPreparation.manifest !== void 0) {
            manifestObject = maskPreparation.manifest;
            manifestJson = maskPreparation.manifest ? JSON.stringify(maskPreparation.manifest) : null;
          }
          if (maskPreparation.pngBytes && maskPreparation.manifest?.key) {
            await env.MAPS_BUCKET.put(maskPreparation.manifest.key, maskPreparation.pngBytes, {
              httpMetadata: { contentType: "image/png" }
            });
          }
          const normalizedColor = typeof body?.color === "string" && body.color.trim().length > 0 ? body.color.trim().toLowerCase() : null;
          const normalizedDescription = normalizeOptionalText(body?.description);
          const normalizedTags = normalizeTagsValue(body?.tags);
          const visibleAtStartFlag = parseBooleanFlag(body?.visibleAtStart);
          await env.MAPS_DB.prepare(
            "UPDATE regions SET name = ?, notes = ?, reveal_order = ?, mask_manifest = ?, color = ?, description = ?, tags = ?, visible_at_start = ? WHERE id = ?"
          ).bind(
            body?.name || null,
            body?.notes || null,
            typeof body?.revealOrder === "number" ? body.revealOrder : null,
            manifestJson,
            normalizedColor,
            normalizedDescription,
            normalizedTags,
            visibleAtStartFlag,
            regionId
          ).run();
          const maskBounds = maskPreparation.manifest?.bounds ?? (body?.mask?.bounds ?? null);
          const maskResponse =
            body?.mask && typeof body.mask === "object" && typeof body.mask.dataUrl === "string"
              ? {
                  dataUrl: body.mask.dataUrl,
                  ...(maskBounds ? { bounds: maskBounds } : {}),
                }
              : null;
          return jsonResponse({ success: true, maskManifest: manifestObject ?? null, mask: maskResponse }, { headers: corsHeaders });
        }
        if (request.method === "DELETE") {
          if (!user)
            return errorResponse("Unauthorized", 401, { headers: corsHeaders });
          const existing = await env.MAPS_DB.prepare("SELECT map_id as mapId FROM regions WHERE id = ?").bind(regionId).first();
          if (!existing)
            return errorResponse("Region not found", 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap)
            return errorResponse("Forbidden", 403, { headers: corsHeaders });
          await env.MAPS_DB.prepare("DELETE FROM regions WHERE id = ?").bind(regionId).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
      }
      if (url.pathname.match(/^\/api\/maps\/[a-z0-9-]+\/markers$/)) {
        const mapId = url.pathname.split("/")[3];
        if (request.method === "GET") {
          const result = await env.MAPS_DB.prepare(
            "SELECT id, map_id as mapId, label, description, tags, visible_at_start as visibleAtStart, notes, region_id as regionId, icon_key as iconKey, x, y, color, data FROM markers WHERE map_id = ? ORDER BY created_at ASC"
          ).bind(mapId).all();
          return jsonResponse({
            markers: result.results.map((m) => {
              const rawData = typeof m.data === "string" ? JSON.parse(m.data) : m.data;
              let regionId = m.regionId && typeof m.regionId === "string" ? m.regionId : null;
              if (!regionId && rawData && typeof rawData === "object" && "regionId" in rawData && rawData.regionId != null) {
                regionId = String(rawData.regionId);
              }
              let description = typeof m.description === "string" ? m.description : m.description ?? null;
              if ((!description || description.length === 0) && rawData && typeof rawData === "object" && typeof rawData.description === "string") {
                description = rawData.description;
              }
              let tags = typeof m.tags === "string" ? m.tags : m.tags ?? null;
              if ((tags === void 0 || tags === null || tags === "") && rawData && typeof rawData === "object") {
                const dataTags = rawData.tags;
                if (typeof dataTags === "string") {
                  tags = dataTags;
                } else if (Array.isArray(dataTags)) {
                  const normalized = dataTags
                    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
                    .filter((entry) => entry.length > 0);
                  tags = normalized.length > 0 ? normalized.join(", ") : null;
                } else if (dataTags === null) {
                  tags = null;
                }
              }
              const visibleAtStart = booleanFromStorage(
                m.visibleAtStart ?? (rawData && typeof rawData === "object" ? rawData.visibleAtStart : void 0)
              );
              const notesValue = typeof m.notes === "string" ? m.notes : m.notes ?? null;
              const fallbackNotes = notesValue ?? (description ?? null);
              return {
                id: typeof m.id === "string" ? m.id : String(m.id ?? ""),
                mapId: typeof m.mapId === "string" ? m.mapId : String(m.mapId ?? mapId),
                label: typeof m.label === "string" ? m.label : String(m.label ?? "Marker"),
                description,
                tags,
                visibleAtStart,
                notes: fallbackNotes,
                regionId,
                iconKey: typeof m.iconKey === "string" ? m.iconKey : m.iconKey ?? null,
                x: typeof m.x === "number" ? m.x : Number(m.x ?? 0),
                y: typeof m.y === "number" ? m.y : Number(m.y ?? 0),
                color: typeof m.color === "string" ? m.color : m.color ?? null,
                data: rawData
              };
            })
          }, { headers: corsHeaders });
        }
        if (request.method === "POST") {
          if (!user)
            return errorResponse("Unauthorized", 401, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, mapId, user.id);
          if (!ownsMap)
            return errorResponse("Map not found", 404, { headers: corsHeaders });
          const body = await parseJSON(request);
          if (!body || typeof body.label !== "string" || typeof body.x !== "number" || typeof body.y !== "number") {
            return errorResponse("Invalid marker", 400, { headers: corsHeaders });
          }
          const markerId = crypto.randomUUID();
          const normalizedDescription = normalizeOptionalText(body.description);
          const normalizedTags = normalizeTagsValue(body.tags);
          const visibleAtStartFlag = parseBooleanFlag(body.visibleAtStart);
          const normalizedNotesInput = normalizeOptionalText(body.notes);
          const noteValue = normalizedNotesInput ?? normalizedDescription;
          let regionId = null;
          if (body.regionId !== void 0) {
            if (body.regionId === null) {
              regionId = null;
            } else if (typeof body.regionId === "string") {
              regionId = body.regionId;
            } else {
              regionId = String(body.regionId);
            }
          }
          if (regionId) {
            const region = await env.MAPS_DB.prepare("SELECT id FROM regions WHERE id = ? AND map_id = ?").bind(regionId, mapId).first();
            if (!region) {
              return errorResponse("Invalid region", 400, { headers: corsHeaders });
            }
          }
          await env.MAPS_DB.prepare(
            "INSERT INTO markers (id, map_id, label, description, tags, visible_at_start, notes, region_id, icon_key, x, y, color, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            markerId,
            mapId,
            body.label,
            normalizedDescription,
            normalizedTags,
            visibleAtStartFlag,
            noteValue,
            regionId,
            body.iconKey || null,
            body.x,
            body.y,
            body.color || null,
            body.data ? JSON.stringify(body.data) : null
          ).run();
          return jsonResponse({
            marker: {
              id: markerId,
              mapId,
              label: body.label,
              description: normalizedDescription,
              tags: normalizedTags,
              visibleAtStart: visibleAtStartFlag > 0,
              iconKey: body.iconKey || null,
              x: body.x,
              y: body.y,
              color: body.color || null,
              data: body.data || null,
              notes: noteValue,
              regionId
            }
          }, { status: 201, headers: corsHeaders });
        }
      }
      if (url.pathname.match(/^\/api\/markers\/[a-z0-9-]+$/)) {
        const markerId = url.pathname.split("/")[3];
        if (request.method === "PUT") {
          if (!user)
            return errorResponse("Unauthorized", 401, { headers: corsHeaders });
          const existing = await env.MAPS_DB.prepare(
            "SELECT map_id as mapId, description, tags, visible_at_start as visibleAtStart, notes, region_id as regionId FROM markers WHERE id = ?"
          ).bind(markerId).first();
          if (!existing)
            return errorResponse("Marker not found", 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap)
            return errorResponse("Forbidden", 403, { headers: corsHeaders });
          const body = await parseJSON(request);
          const descriptionValue =
            body?.description === void 0 ? existing.description ?? null : normalizeOptionalText(body.description);
          const tagsValue =
            body?.tags === void 0 ? existing.tags ?? null : normalizeTagsValue(body.tags);
          const visibleAtStartFlag =
            body?.visibleAtStart === void 0
              ? parseBooleanFlag(existing.visibleAtStart)
              : parseBooleanFlag(body.visibleAtStart);
          const notesFromBody = body?.notes === void 0 ? null : normalizeOptionalText(body.notes);
          const noteValue =
            body?.notes !== void 0
              ? notesFromBody
              : body?.description !== void 0
                ? descriptionValue
                : existing.notes ?? existing.description ?? null;
          let regionId = existing.regionId ?? null;
          if (body?.regionId !== void 0) {
            if (body.regionId === null) {
              regionId = null;
            } else if (typeof body.regionId === "string") {
              regionId = body.regionId;
            } else {
              regionId = String(body.regionId);
            }
          }
          if (regionId) {
            const region = await env.MAPS_DB.prepare("SELECT id FROM regions WHERE id = ? AND map_id = ?").bind(regionId, existing.mapId).first();
            if (!region) {
              return errorResponse("Invalid region", 400, { headers: corsHeaders });
            }
          }
          await env.MAPS_DB.prepare(
            "UPDATE markers SET label = ?, description = ?, tags = ?, visible_at_start = ?, notes = ?, icon_key = ?, x = ?, y = ?, color = ?, data = ?, region_id = ? WHERE id = ?"
          ).bind(
            body?.label || null,
            descriptionValue,
            tagsValue,
            visibleAtStartFlag,
            noteValue,
            body?.iconKey || null,
            typeof body?.x === "number" ? body.x : null,
            typeof body?.y === "number" ? body.y : null,
            body?.color || null,
            body?.data ? JSON.stringify(body.data) : null,
            regionId,
            markerId
          ).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
        if (request.method === "DELETE") {
          if (!user)
            return errorResponse("Unauthorized", 401, { headers: corsHeaders });
          const existing = await env.MAPS_DB.prepare("SELECT map_id as mapId FROM markers WHERE id = ?").bind(markerId).first();
          if (!existing)
            return errorResponse("Marker not found", 404, { headers: corsHeaders });
          const ownsMap = await ensureMapOwnership(env, existing.mapId, user.id);
          if (!ownsMap)
            return errorResponse("Forbidden", 403, { headers: corsHeaders });
          await env.MAPS_DB.prepare("DELETE FROM markers WHERE id = ?").bind(markerId).run();
          return jsonResponse({ success: true }, { headers: corsHeaders });
        }
      }
      if (url.pathname === "/api/assets/marker" && request.method === "POST") {
        if (!user)
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        const body = await parseJSON(request);
        const fileName = body?.fileName || `${crypto.randomUUID()}.png`;
        const key = `assets/${user.id}/${fileName}`;
        const uploadUrl = await createSignedUpload(env, env.MAPS_BUCKET, key, "PUT", 900);
        await env.MAPS_DB.prepare("INSERT INTO assets (id, owner_id, key, type) VALUES (?, ?, ?, ?)").bind(crypto.randomUUID(), user.id, key, "marker").run();
        return jsonResponse({ key, uploadUrl: uploadUrl.toString() }, { status: 201, headers: corsHeaders });
      }
      if (url.pathname.startsWith("/api/assets/marker/") && request.method === "GET") {
        const key = decodeURIComponent(url.pathname.replace("/api/assets/marker/", ""));
        const object = await env.MAPS_BUCKET.get(key);
        if (!object) {
          return new Response("Not found", { status: 404, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        if (object.httpMetadata?.contentType) {
          headers.set("Content-Type", object.httpMetadata.contentType);
        }
        return new Response(object.body, {
          status: 200,
          headers
        });
      }
      if (url.pathname === "/api/sessions" && request.method === "POST") {
        if (!user)
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        const body = await parseJSON(request);
        if (!body || typeof body.campaignId !== "string" || typeof body.mapId !== "string" || typeof body.name !== "string") {
          return errorResponse("Missing session fields", 400, { headers: corsHeaders });
        }
        const ownsCampaign = await ensureCampaignOwnership(env, body.campaignId, user.id);
        const ownsMap = await ensureMapOwnership(env, body.mapId, user.id);
        if (!ownsCampaign || !ownsMap) {
          return errorResponse("Invalid campaign or map", 400, { headers: corsHeaders });
        }
        const sessionId = crypto.randomUUID();
        await env.MAPS_DB.prepare(
          "INSERT INTO sessions (id, campaign_id, map_id, host_id, name, status) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(sessionId, body.campaignId, body.mapId, user.id, body.name, "active").run();
        const stub = await getSessionStub(env, sessionId);
        await stub.fetch("https://session/setup", {
          method: "POST",
          body: JSON.stringify({
            sessionId,
            campaignId: body.campaignId,
            mapId: body.mapId,
            hostId: user.id,
            name: body.name,
            metadata: body.metadata || {}
          })
        });
        return jsonResponse({ session: { id: sessionId, campaignId: body.campaignId, mapId: body.mapId, name: body.name, status: "active" } }, { status: 201, headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+$/) && request.method === "GET") {
        const sessionId = url.pathname.split("/")[3];
        const session = await env.MAPS_DB.prepare(
          `SELECT s.id, s.name, s.status, s.campaign_id as campaignId, s.map_id as mapId, s.host_id as hostId,
                  s.created_at as createdAt, s.ended_at as endedAt,
                  c.name as campaignName, m.name as mapName
           FROM sessions s
           LEFT JOIN campaigns c ON s.campaign_id = c.id
           LEFT JOIN maps m ON s.map_id = m.id
           WHERE s.id = ?`
        ).bind(sessionId).first();
        if (!session) {
          return errorResponse("Session not found", 404, { headers: corsHeaders });
        }
        return jsonResponse({ session }, { headers: corsHeaders });
      }
      if (url.pathname === "/api/lobby" && request.method === "GET") {
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
      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/save$/) && request.method === "POST") {
        if (!user)
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        const sessionId = url.pathname.split("/")[3];
        const session = await env.MAPS_DB.prepare("SELECT id, campaign_id as campaignId FROM sessions WHERE id = ? AND host_id = ?").bind(sessionId, user.id).first();
        if (!session)
          return errorResponse("Session not found", 404, { headers: corsHeaders });
        const stub = await getSessionStub(env, sessionId);
        const stateResp = await stub.fetch("https://session/state");
        const state = await stateResp.json();
        const now = /* @__PURE__ */ new Date();
        const yyyy = now.getUTCFullYear();
        const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(now.getUTCDate()).padStart(2, "0");
        const hhmmss = `${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
        const key = `backups/${session.campaignId}/${yyyy}/${mm}/${dd}/${hhmmss}.json`;
        await env.MAPS_BUCKET.put(key, JSON.stringify(state), { httpMetadata: { contentType: "application/json" } });
        return jsonResponse({ backupKey: key }, { headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/end$/) && request.method === "POST") {
        if (!user)
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        const sessionId = url.pathname.split("/")[3];
        const session = await env.MAPS_DB.prepare("SELECT id FROM sessions WHERE id = ? AND host_id = ?").bind(sessionId, user.id).first();
        if (!session)
          return errorResponse("Session not found", 404, { headers: corsHeaders });
        await env.MAPS_DB.prepare("UPDATE sessions SET status = ?, ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind("ended", sessionId).run();
        const stub = await getSessionStub(env, sessionId);
        await stub.fetch("https://session/end", { method: "POST" });
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }
      if (url.pathname.match(/^\/api\/sessions\/[a-z0-9-]+\/restore$/) && request.method === "POST") {
        if (!user)
          return errorResponse("Unauthorized", 401, { headers: corsHeaders });
        const sessionId = url.pathname.split("/")[3];
        const body = await parseJSON(request);
        if (!body?.backupKey)
          return errorResponse("Missing backupKey", 400, { headers: corsHeaders });
        const session = await env.MAPS_DB.prepare("SELECT id, host_id FROM sessions WHERE id = ?").bind(sessionId).first();
        if (!session || session.host_id !== user.id)
          return errorResponse("Session not found", 404, { headers: corsHeaders });
        const object = await env.MAPS_BUCKET.get(body.backupKey);
        if (!object)
          return errorResponse("Backup not found", 404, { headers: corsHeaders });
        const state = await object.json();
        const stub = await getSessionStub(env, sessionId);
        await stub.fetch("https://session/restore", { method: "POST", body: JSON.stringify({ state, clone: !!body.clone }) });
        return jsonResponse({ success: true }, { headers: corsHeaders });
      }
      return new Response("Not found", { status: 404, headers: corsHeaders });
    } catch (err) {
      const errorId = crypto.randomUUID();
      console.error("API error", {
        errorId,
        errorName: err?.name,
        errorMessage: err?.message,
        errorStack: err?.stack,
      });
      return errorResponse("Internal Server Error", 500, { headers: corsHeaders }, { errorId });
    }    
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
