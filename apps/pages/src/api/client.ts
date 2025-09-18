import type {
  AuthResponse,
  Campaign,
  LobbySessionSummary,
  MapRecord,
  Marker,
  Region,
  SessionRecord,
  User,
} from '../types';

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
  polygon: Array<{ x: number; y: number }>;
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
}

interface SessionPayload {
  campaignId: string;
  mapId: string;
  name: string;
}

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

  async getRegions(mapId: string): Promise<Region[]> {
    const { regions } = await this.request<{ regions: Region[] }>(`/api/maps/${mapId}/regions`);
    return regions;
  }

  async createRegion(mapId: string, payload: RegionPayload): Promise<Region> {
    const { region } = await this.request<{ region: Region }>(`/api/maps/${mapId}/regions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return region;
  }

  async updateRegion(regionId: string, payload: Partial<RegionPayload>) {
    await this.request(`/api/regions/${regionId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteRegion(regionId: string) {
    await this.request(`/api/regions/${regionId}`, { method: 'DELETE' });
  }

  async getMarkers(mapId: string): Promise<Marker[]> {
    const { markers } = await this.request<{ markers: Marker[] }>(`/api/maps/${mapId}/markers`);
    return markers;
  }

  async createMarker(mapId: string, payload: MarkerPayload): Promise<Marker> {
    const { marker } = await this.request<{ marker: Marker }>(`/api/maps/${mapId}/markers`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return marker;
  }

  async updateMarker(markerId: string, payload: Partial<MarkerPayload>) {
    await this.request(`/api/markers/${markerId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
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
