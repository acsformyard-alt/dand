import type {
  AuthResponse,
  Campaign,
  LobbySessionSummary,
  MapRecord,
  Marker,
  MarkerAreaShape,
  MarkerCircleGeometry,
  MarkerKind,
  MarkerPolygonGeometry,
  Region,
  RoomMaskManifestEntry,
  SessionRecord,
  User,
} from '../types';
import {
  createRoomMaskFromPolygon,
  decodeRoomMaskFromDataUrl,
  encodeRoomMaskToDataUrl,
  emptyRoomMask,
  roomMaskToVector,
  type RoomMask,
} from '../utils/roomMask';

interface SignupPayload {
  email: string;
  password: string;
  displayName: string;
}

interface LoginPayload {
  email: string;
  password: string;
}

interface CampaignPayload {
  name: string;
  description?: string;
  isPublic?: boolean;
}

interface MapPayload {
  campaignId: string;
  name: string;
  originalExtension: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

interface RegionPayload {
  name: string;
  mask: RoomMask;
  maskManifest?: RoomMaskManifestEntry | null;
  notes?: string;
  revealOrder?: number;
}

interface MarkerPayload {
  label: string;
  description?: string;
  iconKey?: string;
  x: number;
  y: number;
  color?: string;
  notes?: string;
  kind?: MarkerKind;
  areaShape?: MarkerAreaShape | null;
  circle?: MarkerCircleGeometry | null;
  polygon?: MarkerPolygonGeometry | null;
}

interface SessionPayload {
  campaignId: string;
  mapId: string;
  name: string;
}

const polygonPointsFromRaw = (rawPolygon: unknown) => {
  if (!Array.isArray(rawPolygon)) {
    return [] as Array<{ x: number; y: number }>;
  }
  const points: Array<{ x: number; y: number }> = [];
  for (const candidate of rawPolygon) {
    if (candidate && typeof candidate === 'object') {
      const maybeArray = candidate as unknown as Array<number>;
      const x = Number((candidate as { x?: number }).x ?? maybeArray?.[0]);
      const y = Number((candidate as { y?: number }).y ?? maybeArray?.[1]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        points.push({ x, y });
      }
    }
  }
  return points;
};

const clampNormalized = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (numeric <= 0) {
    return 0;
  }
  if (numeric >= 1) {
    return 1;
  }
  return numeric;
};

const markerPointFromRaw = (point: unknown) => {
  if (!point) {
    return null;
  }
  if (Array.isArray(point) && point.length >= 2) {
    return { x: clampNormalized(point[0]), y: clampNormalized(point[1]) };
  }
  if (typeof point === 'object') {
    const candidate = point as { x?: unknown; y?: unknown };
    if (candidate.x !== undefined && candidate.y !== undefined) {
      return {
        x: clampNormalized(candidate.x),
        y: clampNormalized(candidate.y),
      };
    }
  }
  return null;
};

const normalizeMarkerCircleGeometry = (circle: unknown): MarkerCircleGeometry | null => {
  if (!circle || typeof circle !== 'object') {
    return null;
  }
  const circleObject = circle as { center?: unknown; radius?: unknown };
  const center = markerPointFromRaw(circleObject.center);
  const radius = Number(circleObject.radius);
  if (!center || !Number.isFinite(radius) || radius <= 0) {
    return null;
  }
  return {
    center: {
      x: clampNormalized(center.x),
      y: clampNormalized(center.y),
    },
    radius,
  };
};

const normalizeMarkerPolygonGeometry = (polygon: unknown): MarkerPolygonGeometry | null => {
  const points = polygonPointsFromRaw(polygon).map((point) => ({
    x: clampNormalized(point.x),
    y: clampNormalized(point.y),
  }));
  if (points.length < 3) {
    return null;
  }
  return points;
};

const markerAreaShapeFromRaw = (shape: unknown): MarkerAreaShape | null => {
  if (typeof shape !== 'string') {
    return null;
  }
  if (shape === 'circle') {
    return 'circle';
  }
  if (shape === 'polygon' || shape === 'lasso') {
    return 'polygon';
  }
  return null;
};

const serializeMarkerPayload = (payload: Partial<MarkerPayload>) => {
  const body: Record<string, unknown> = {};
  if (payload.label !== undefined) {
    body.label = payload.label;
  }
  if (payload.description !== undefined) {
    body.description = payload.description;
  }
  if (payload.iconKey !== undefined) {
    body.iconKey = payload.iconKey;
  }
  if (payload.color !== undefined) {
    body.color = payload.color;
  }
  if (payload.notes !== undefined) {
    body.notes = payload.notes;
  }
  if (payload.x !== undefined) {
    body.x = clampNormalized(payload.x, 0.5);
  }
  if (payload.y !== undefined) {
    body.y = clampNormalized(payload.y, 0.5);
  }

  let nextKind: MarkerKind | undefined;
  if (payload.kind === 'point' || payload.kind === 'area') {
    nextKind = payload.kind;
  }

  const circleProvided = payload.circle !== undefined;
  const polygonProvided = payload.polygon !== undefined;
  const normalizedCircle = circleProvided ? normalizeMarkerCircleGeometry(payload.circle) : null;
  const normalizedPolygon = polygonProvided ? normalizeMarkerPolygonGeometry(payload.polygon) : null;

  let nextShape: MarkerAreaShape | null | undefined;
  if (payload.areaShape !== undefined) {
    nextShape = markerAreaShapeFromRaw(payload.areaShape);
    if (payload.areaShape === null) {
      nextShape = null;
    }
  }

  if (!nextKind) {
    if (normalizedCircle || normalizedPolygon) {
      nextKind = 'area';
    }
  }

  if (nextKind === 'area') {
    if (!nextShape) {
      nextShape = normalizedCircle ? 'circle' : normalizedPolygon ? 'polygon' : null;
    }
    if (nextShape === 'circle' && !normalizedCircle) {
      nextShape = null;
    }
    if (nextShape === 'polygon' && !normalizedPolygon) {
      nextShape = null;
    }
    if (!nextShape) {
      nextKind = 'point';
    }
  }

  const data: Record<string, unknown> = {};
  let hasData = false;

  if (nextKind) {
    data.kind = nextKind;
    hasData = true;
  }

  if (nextKind === 'area') {
    if (nextShape === 'circle' && normalizedCircle) {
      data.areaShape = 'circle';
      data.circle = normalizedCircle;
      hasData = true;
    } else if (nextShape === 'polygon' && normalizedPolygon) {
      data.areaShape = 'polygon';
      data.polygon = normalizedPolygon;
      hasData = true;
    }
  } else if (payload.areaShape === null) {
    data.areaShape = null;
    hasData = true;
  }

  if (hasData) {
    body.data = data;
  }

  return body;
};

const normalizeMarker = (raw: any): Marker => {
  const base: Marker = {
    id: String(raw?.id ?? ''),
    mapId: raw?.mapId ? String(raw.mapId) : undefined,
    label: typeof raw?.label === 'string' ? raw.label : 'Marker',
    description: typeof raw?.description === 'string' ? raw.description : raw?.description ?? null,
    iconKey: typeof raw?.iconKey === 'string' ? raw.iconKey : raw?.iconKey ?? null,
    x: clampNormalized(raw?.x, 0.5),
    y: clampNormalized(raw?.y, 0.5),
    color: typeof raw?.color === 'string' ? raw.color : raw?.color ?? null,
    notes: typeof raw?.notes === 'string' ? raw.notes : raw?.notes ?? null,
    kind: 'point',
    areaShape: null,
    circle: null,
    polygon: null,
  };

  const data = raw?.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>) : {};
  const kind = raw?.kind ?? data.kind;
  if (kind === 'area') {
    base.kind = 'area';
  }

  let shape = markerAreaShapeFromRaw(raw?.areaShape ?? data.areaShape);
  if (shape && base.kind !== 'area') {
    shape = null;
  }

  const circle = normalizeMarkerCircleGeometry(raw?.circle ?? data.circle);
  const polygon = normalizeMarkerPolygonGeometry(raw?.polygon ?? data.polygon);

  if (base.kind === 'area') {
    if (shape === 'circle' && circle) {
      base.areaShape = 'circle';
      base.circle = circle;
    } else if (shape === 'polygon' && polygon) {
      base.areaShape = 'polygon';
      base.polygon = polygon;
    } else if (circle) {
      base.areaShape = 'circle';
      base.circle = circle;
    } else if (polygon) {
      base.areaShape = 'polygon';
      base.polygon = polygon;
    } else {
      base.kind = 'point';
    }
  }

  return base;
};

const ensureManifest = (
  roomId: string,
  mask: RoomMask,
  manifest?: RoomMaskManifestEntry | null,
): RoomMaskManifestEntry =>
  manifest ?? { roomId, key: `room-masks/${roomId}.png`, dataUrl: encodeRoomMaskToDataUrl(mask) };

const normalizeRegion = (raw: any): Region => {
  const polygon = polygonPointsFromRaw(raw?.polygon);
  let mask: RoomMask | null = null;
  const rawMask = raw?.mask;
  if (rawMask && typeof rawMask === 'object') {
    if (typeof rawMask.dataUrl === 'string') {
      try {
        mask = decodeRoomMaskFromDataUrl(rawMask.dataUrl);
        if (rawMask.bounds) {
          mask = {
            ...mask,
            bounds: {
              minX: Number(rawMask.bounds.minX) || mask.bounds.minX,
              minY: Number(rawMask.bounds.minY) || mask.bounds.minY,
              maxX: Number(rawMask.bounds.maxX) || mask.bounds.maxX,
              maxY: Number(rawMask.bounds.maxY) || mask.bounds.maxY,
            },
          };
        }
      } catch (_error) {
        mask = null;
      }
    }
  }
  if (!mask && polygon.length) {
    mask = createRoomMaskFromPolygon(polygon, { resolution: 256 });
  }
  if (!mask) {
    mask = emptyRoomMask();
  }
  const manifest = ensureManifest(String(raw?.id ?? ''), mask, raw?.maskManifest);
  return {
    id: String(raw?.id ?? ''),
    mapId: String(raw?.mapId ?? ''),
    name: typeof raw?.name === 'string' ? raw.name : 'Room',
    mask,
    maskManifest: manifest,
    notes: typeof raw?.notes === 'string' ? raw.notes : raw?.notes ?? null,
    revealOrder: raw?.revealOrder ?? null,
  };
};

const serializeRegionPayload = (payload: Partial<RegionPayload>) => {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    body.name = payload.name;
  }
  if (payload.notes !== undefined) {
    body.notes = payload.notes;
  }
  if (payload.revealOrder !== undefined) {
    body.revealOrder = payload.revealOrder;
  }
  if (payload.mask) {
    body.mask = {
      dataUrl: encodeRoomMaskToDataUrl(payload.mask),
      width: payload.mask.width,
      height: payload.mask.height,
      bounds: payload.mask.bounds,
    };
    body.polygon = roomMaskToVector(payload.mask);
  }
  if (payload.maskManifest !== undefined) {
    body.maskManifest = payload.maskManifest;
  }
  return body;
};

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private buildUrl(path: string) {
    if (!this.baseUrl) {
      return path;
    }
    if (path.startsWith('http')) return path;
    return `${this.baseUrl}${path}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers || {});
    headers.set('Content-Type', 'application/json');
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    const response = await fetch(this.buildUrl(path), {
      ...init,
      headers,
    });
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const data = await response.json();
        errorMessage = data.error || errorMessage;
      } catch (err) {
        // ignore
      }
      throw new Error(errorMessage);
    }
    if (response.status === 204) {
      return {} as T;
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async signup(payload: SignupPayload): Promise<AuthResponse> {
    const result = await this.request<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return result;
  }

  async login(payload: LoginPayload): Promise<AuthResponse> {
    return this.request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCampaigns(opts: { publicOnly?: boolean } = {}): Promise<Campaign[]> {
    const path = opts.publicOnly ? '/api/campaigns?public=1' : '/api/campaigns';
    const { campaigns } = await this.request<{ campaigns: Campaign[] }>(path);
    return campaigns;
  }

  async createCampaign(payload: CampaignPayload): Promise<Campaign> {
    const result = await this.request<{ id: string; name: string; description?: string | null; isPublic: boolean }>(
      '/api/campaigns',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return {
      id: result.id,
      name: result.name,
      description: result.description,
      isPublic: result.isPublic,
    };
  }

  async deleteCampaign(campaignId: string) {
    await this.request(`/api/campaigns/${campaignId}`, { method: 'DELETE' });
  }

  async getMapsForCampaign(campaignId: string): Promise<MapRecord[]> {
    const { maps } = await this.request<{ maps: MapRecord[] }>(`/api/campaigns/${campaignId}/maps`);
    return maps;
  }

  async createMap(payload: MapPayload) {
    return this.request<{ map: MapRecord; uploads: { original: string; display: string } }>('/api/maps', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getMap(mapId: string): Promise<MapRecord> {
    const { map } = await this.request<{ map: MapRecord }>(`/api/maps/${mapId}`);
    return map;
  }

  async deleteMap(mapId: string) {
    await this.request(`/api/maps/${mapId}`, { method: 'DELETE' });
  }

  async getRegions(mapId: string): Promise<Region[]> {
    const { regions } = await this.request<{ regions: unknown[] }>(`/api/maps/${mapId}/regions`);
    if (!Array.isArray(regions)) {
      return [];
    }
    return regions.map((region) => normalizeRegion(region));
  }

  async createRegion(mapId: string, payload: RegionPayload): Promise<Region> {
    const body = serializeRegionPayload(payload);
    const { region } = await this.request<{ region: unknown }>(`/api/maps/${mapId}/regions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return normalizeRegion(region);
  }

  async updateRegion(regionId: string, payload: Partial<RegionPayload>) {
    const body = serializeRegionPayload(payload);
    await this.request(`/api/regions/${regionId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteRegion(regionId: string) {
    await this.request(`/api/regions/${regionId}`, { method: 'DELETE' });
  }

  async getMarkers(mapId: string): Promise<Marker[]> {
    const { markers } = await this.request<{ markers: unknown[] }>(`/api/maps/${mapId}/markers`);
    if (!Array.isArray(markers)) {
      return [];
    }
    return markers.map((marker) => normalizeMarker(marker));
  }

  async createMarker(mapId: string, payload: MarkerPayload): Promise<Marker> {
    const body = serializeMarkerPayload(payload);
    const { marker } = await this.request<{ marker: unknown }>(`/api/maps/${mapId}/markers`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return normalizeMarker(marker);
  }

  async updateMarker(markerId: string, payload: Partial<MarkerPayload>) {
    const body = serializeMarkerPayload(payload);
    await this.request(`/api/markers/${markerId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  async deleteMarker(markerId: string) {
    await this.request(`/api/markers/${markerId}`, { method: 'DELETE' });
  }

  async createSession(payload: SessionPayload): Promise<SessionRecord> {
    const { session } = await this.request<{ session: SessionRecord }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return session;
  }

  async getSession(sessionId: string): Promise<SessionRecord> {
    const { session } = await this.request<{ session: SessionRecord }>(`/api/sessions/${sessionId}`);
    return session;
  }

  async saveSession(sessionId: string) {
    const { backupKey } = await this.request<{ backupKey: string }>(`/api/sessions/${sessionId}/save`, {
      method: 'POST',
    });
    return backupKey;
  }

  async endSession(sessionId: string) {
    await this.request(`/api/sessions/${sessionId}/end`, { method: 'POST' });
  }

  async restoreSession(sessionId: string, backupKey: string, clone = false) {
    await this.request(`/api/sessions/${sessionId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ backupKey, clone }),
    });
  }

  async getLobby(): Promise<LobbySessionSummary[]> {
    const { sessions } = await this.request<{ sessions: LobbySessionSummary[] }>('/api/lobby');
    return sessions;
  }

  buildAssetUrl(key: string) {
    return this.buildUrl(`/api/assets/marker/${encodeURIComponent(key)}`);
  }

  buildMapDisplayUrl(mapId: string) {
    return this.buildUrl(`/api/maps/${mapId}/display`);
  }

  buildWebSocketUrl(sessionId: string, params: Record<string, string | undefined> = {}) {
    const base = this.baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    const url = new URL(`/api/sessions/${sessionId}/ws`, base || 'http://localhost');
    url.protocol = url.protocol.replace('http', 'ws');
    Object.entries(params).forEach(([key, value]) => {
      if (typeof value !== 'undefined') {
        url.searchParams.set(key, value);
      }
    });
    return url.toString();
  }
}

export const apiClient = new ApiClient();
