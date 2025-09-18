export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  isPublic: boolean;
  createdAt?: string;
}

export interface MapRecord {
  id: string;
  campaignId: string;
  ownerId?: string;
  name: string;
  originalKey?: string | null;
  displayKey?: string | null;
  width?: number | null;
  height?: number | null;
  metadata?: Record<string, unknown> | null;
}

export interface Region {
  id: string;
  mapId: string;
  name: string;
  polygon: Array<{ x: number; y: number }>;
  notes?: string | null;
  revealOrder?: number | null;
}

export interface Marker {
  id: string;
  mapId?: string;
  label: string;
  description?: string | null;
  iconKey?: string | null;
  x: number;
  y: number;
  color?: string | null;
  notes?: string | null;
}

export interface SessionRecord {
  id: string;
  campaignId: string;
  mapId: string;
  name: string;
  status: string;
  createdAt?: string;
  endedAt?: string | null;
  campaignName?: string;
  mapName?: string;
  hostId?: string;
}

export interface SessionState {
  sessionId: string | null;
  campaignId: string | null;
  mapId: string | null;
  hostId: string | null;
  name: string | null;
  status: string;
  revealedRegions: string[];
  markers: Record<string, Marker>;
  metadata: Record<string, unknown>;
  players: Array<{ id: string; role: string; name: string }>;
  lastUpdated?: string;
}

export interface LobbySessionSummary {
  id: string;
  name: string;
  campaignId: string;
  mapId: string;
  status: string;
  createdAt?: string;
  campaignName?: string;
  mapName?: string;
}

export interface ApiClientOptions {
  token?: string | null;
}
