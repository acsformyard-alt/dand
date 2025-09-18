export interface ApiUser {
  id: string;
  email: string;
  displayName: string;
}

export interface ApiCampaign {
  id: string;
  name: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface ApiMap {
  id: string;
  campaignId: string;
  name: string;
  description?: string | null;
  displayKey?: string | null;
  width?: number | null;
  height?: number | null;
}

export interface ApiRegion {
  id: string;
  mapId: string;
  name: string;
  polygon: number[][];
  orderIndex: number;
}

export interface ApiMarker {
  id: string;
  mapId: string;
  name: string;
  markerType: string;
  position: { x: number; y: number };
  data?: Record<string, unknown> | null;
}

export interface ApiSession {
  id: string;
  campaignId: string;
  mapId: string;
  name: string;
  status: string;
}

interface ApiRequestOptions extends RequestInit {
  auth?: boolean;
}

class APIClient {
  private token: string | null;
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "";
    this.token = null;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(options.headers ?? {});
    if (!headers.has("content-type") && options.body && typeof options.body === "string") {
      headers.set("content-type", "application/json");
    }
    if (options.auth && this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers
    });
    if (!response.ok) {
      let message = response.statusText;
      try {
        const data = await response.json();
        message = data.error ?? message;
      } catch (err) {
        // ignore json parse errors
      }
      throw new Error(message || `Request failed: ${response.status}`);
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  async signup(email: string, password: string, displayName: string) {
    const result = await this.request<{ user: ApiUser; token: string }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName })
    });
    this.setToken(result.token);
    return result;
  }

  async login(email: string, password: string) {
    const result = await this.request<{ user: ApiUser; token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    this.setToken(result.token);
    return result;
  }

  async listCampaigns(publicOnly = false) {
    const query = publicOnly ? "?public=1" : "";
    const result = await this.request<{ campaigns: ApiCampaign[] }>(`/api/campaigns${query}`, {
      auth: !publicOnly
    });
    return result.campaigns;
  }

  async createCampaign(payload: { name: string; description?: string; isPublic?: boolean }) {
    const result = await this.request<{ campaign: ApiCampaign }>("/api/campaigns", {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload)
    });
    return result.campaign;
  }

  async listMaps(campaignId?: string) {
    const query = campaignId ? `?campaignId=${encodeURIComponent(campaignId)}` : "";
    const result = await this.request<{ maps: ApiMap[] }>(`/api/maps${query}`);
    return result.maps;
  }

  async createMap(payload: {
    campaignId: string;
    name: string;
    description?: string;
    fileExtension?: string;
    width?: number;
    height?: number;
    contentType?: string;
  }) {
    const result = await this.request<{ map: ApiMap; uploads: Record<string, unknown> }>("/api/maps", {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload)
    });
    return result;
  }

  async listRegions(mapId: string) {
    const result = await this.request<{ regions: any[] }>(`/api/maps/${mapId}/regions`);
    return result.regions.map((region) => ({
      id: region.id,
      mapId: region.mapId,
      name: region.name,
      polygon: Array.isArray(region.polygon)
        ? region.polygon
        : JSON.parse(region.polygonJson ?? region.polygon ?? "[]"),
      orderIndex: region.orderIndex ?? 0
    }));
  }

  async createRegion(mapId: string, payload: { name: string; polygon: number[][]; orderIndex?: number }) {
    const result = await this.request<{ region: ApiRegion }>(`/api/maps/${mapId}/regions`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload)
    });
    return result.region;
  }

  async updateRegion(regionId: string, payload: Partial<{ name: string; polygon: number[][]; orderIndex: number }>) {
    await this.request(`/api/regions/${regionId}`, {
      method: "PUT",
      auth: true,
      body: JSON.stringify(payload)
    });
  }

  async deleteRegion(regionId: string) {
    await this.request(`/api/regions/${regionId}`, {
      method: "DELETE",
      auth: true
    });
  }

  async listMarkers(mapId: string) {
    const result = await this.request<{ markers: any[] }>(`/api/maps/${mapId}/markers`);
    return result.markers.map((marker) => ({
      id: marker.id,
      mapId: marker.mapId,
      name: marker.name,
      markerType: marker.markerType,
      position: typeof marker.position === "object" && marker.position !== null
        ? marker.position
        : JSON.parse(marker.positionJson ?? marker.position ?? "{}"),
      data: typeof marker.data === "object" || marker.data == null
        ? marker.data
        : JSON.parse(marker.dataJson ?? marker.data ?? "{}")
    }));
  }

  async createMarker(mapId: string, payload: { name: string; markerType: string; position: { x: number; y: number }; data?: Record<string, unknown> }) {
    const result = await this.request<{ marker: ApiMarker }>(`/api/maps/${mapId}/markers`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload)
    });
    return result.marker;
  }

  async updateMarker(markerId: string, payload: Partial<{ name: string; markerType: string; position: { x: number; y: number }; data: Record<string, unknown> }>) {
    await this.request(`/api/markers/${markerId}`, {
      method: "PUT",
      auth: true,
      body: JSON.stringify(payload)
    });
  }

  async deleteMarker(markerId: string) {
    await this.request(`/api/markers/${markerId}`, {
      method: "DELETE",
      auth: true
    });
  }

  async createSession(payload: { campaignId: string; mapId: string; name: string }) {
    const result = await this.request<{ session: ApiSession }>("/api/sessions", {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload)
    });
    return result.session;
  }

  async listLobby() {
    const result = await this.request<{ sessions: ApiSession[] }>("/api/lobby");
    return result.sessions;
  }

  async saveSession(sessionId: string) {
    const result = await this.request<{ backupKey: string }>(`/api/sessions/${sessionId}/save`, {
      method: "POST",
      auth: true
    });
    return result;
  }

  async endSession(sessionId: string) {
    await this.request(`/api/sessions/${sessionId}/end`, {
      method: "POST",
      auth: true
    });
  }

  async restoreSession(sessionId: string, payload: { backupKey: string; clone?: boolean }) {
    const result = await this.request(`/api/sessions/${sessionId}/restore`, {
      method: "POST",
      auth: true,
      body: JSON.stringify(payload)
    });
    return result;
  }

  socketUrl(sessionId: string) {
    if (!this.baseUrl) {
      throw new Error("API base URL not configured");
    }
    const url = new URL(`/api/sessions/${sessionId}/socket`, this.baseUrl);
    if (url.protocol.startsWith("http")) {
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    }
    return url.toString();
  }
}

export const apiClient = new APIClient();
