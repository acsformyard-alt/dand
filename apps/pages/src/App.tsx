import React, { useEffect, useMemo, useState } from 'react';
import AuthPanel from './components/AuthPanel';
import SessionViewer from './components/SessionViewer';
import RegionList from './components/RegionList';
import MarkerPanel from './components/MarkerPanel';
import MapMaskCanvas from './components/MapMaskCanvas';
import { apiClient } from './api/client';
import type {
  AuthResponse,
  Campaign,
  LobbySessionSummary,
  MapRecord,
  Marker,
  Region,
  SessionRecord,
  User,
} from './types';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [token, setToken] = useState<string | null>(() => (typeof window !== 'undefined' ? localStorage.getItem('authToken') : null));
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem('user');
    return stored ? (JSON.parse(stored) as User) : null;
  });

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [maps, setMaps] = useState<MapRecord[]>([]);
  const [selectedMap, setSelectedMap] = useState<MapRecord | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [lobbySessions, setLobbySessions] = useState<LobbySessionSummary[]>([]);
  const [activeSession, setActiveSession] = useState<SessionRecord | null>(null);
  const [sessionMode, setSessionMode] = useState<'dm' | 'player'>('dm');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.body.classList.toggle('dark', theme === 'dark');
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    const storedTheme = typeof window !== 'undefined' ? (localStorage.getItem('theme') as 'light' | 'dark' | null) : null;
    if (storedTheme) {
      setTheme(storedTheme);
    }
  }, []);

  useEffect(() => {
    apiClient.setToken(token);
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('authToken', token);
      } else {
        localStorage.removeItem('authToken');
      }
    }
  }, [token]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (user) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('user');
      }
    }
  }, [user]);

  const handleAuthenticated = async (response: AuthResponse) => {
    setToken(response.token);
    setUser(response.user);
    setStatusMessage('Welcome back!');
    await refreshCampaigns();
    await refreshLobby();
  };

  const refreshCampaigns = async () => {
    if (!token) return;
    try {
      const list = await apiClient.getCampaigns();
      setCampaigns(list);
      if (list.length > 0 && !selectedCampaign) {
        setSelectedCampaign(list[0]);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage((err as Error).message);
    }
  };

  const refreshLobby = async () => {
    try {
      const sessions = await apiClient.getLobby();
      setLobbySessions(sessions);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token) {
      refreshCampaigns();
      refreshLobby();
    }
  }, [token]);

  useEffect(() => {
    const loadForCampaign = async () => {
      if (!selectedCampaign) return;
      try {
        const campaignMaps = await apiClient.getMapsForCampaign(selectedCampaign.id);
        setMaps(campaignMaps);
        if (campaignMaps.length > 0) {
          setSelectedMap(campaignMaps[0]);
        } else {
          setSelectedMap(null);
          setRegions([]);
          setMarkers([]);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadForCampaign();
  }, [selectedCampaign?.id]);

  useEffect(() => {
    const loadMapDetails = async () => {
      if (!selectedMap) return;
      try {
        const mapRegions = await apiClient.getRegions(selectedMap.id);
        const mapMarkers = await apiClient.getMarkers(selectedMap.id);
        setRegions(mapRegions);
        setMarkers(mapMarkers);
      } catch (err) {
        console.error(err);
      }
    };
    loadMapDetails();
  }, [selectedMap?.id]);

  const handleCreateCampaign = async () => {
    const name = window.prompt('Campaign name');
    if (!name) return;
    const description = window.prompt('Description (optional)') || undefined;
    const isPublic = window.confirm('Make this campaign public?');
    try {
      const created = await apiClient.createCampaign({ name, description, isPublic });
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaign(created);
      setStatusMessage('Campaign created');
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleCreateMap = async () => {
    if (!selectedCampaign) return;
    const name = window.prompt('Map name');
    if (!name) return;
    const extension = window.prompt('Original file extension (png, jpg, webp)', 'png') || 'png';
    const width = Number(window.prompt('Map width (px, optional)', '2048')) || undefined;
    const height = Number(window.prompt('Map height (px, optional)', '2048')) || undefined;
    try {
      const result = await apiClient.createMap({
        campaignId: selectedCampaign.id,
        name,
        originalExtension: extension,
        width,
        height,
      });
      setMaps((prev) => [result.map, ...prev]);
      setSelectedMap(result.map);
      window.alert(`Upload your map using the following URL (PUT request):\n${result.uploads.original}`);
      setStatusMessage('Map created. Upload via signed URL.');
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleCreateRegion = async () => {
    if (!selectedMap) return;
    const name = window.prompt('Region name');
    if (!name) return;
    const polygonInput = window.prompt('Polygon points as x,y pairs (e.g. 0.1,0.2;0.2,0.25;0.15,0.3)');
    if (!polygonInput) return;
    const polygon = polygonInput.split(';').map((pair) => {
      const [x, y] = pair.split(',').map((value) => Number(value.trim()));
      return { x, y };
    });
    try {
      const region = await apiClient.createRegion(selectedMap.id, { name, polygon });
      setRegions((prev) => [...prev, region]);
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleCreateMarker = async () => {
    if (!selectedMap) return;
    const label = window.prompt('Marker label');
    if (!label) return;
    const x = Number(window.prompt('X coordinate (0-1)', '0.5'));
    const y = Number(window.prompt('Y coordinate (0-1)', '0.5'));
    const color = window.prompt('Color', '#facc15') || '#facc15';
    try {
      const marker = await apiClient.createMarker(selectedMap.id, { label, x, y, color });
      setMarkers((prev) => [...prev, marker]);
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const mySessions = useMemo(() => lobbySessions.filter((session) => session.hostId === user?.id), [lobbySessions, user?.id]);

  const handleStartSession = async () => {
    if (!selectedCampaign || !selectedMap) {
      window.alert('Select a campaign and map first.');
      return;
    }
    const name = window.prompt('Session name', `${selectedCampaign.name} - Live Session`);
    if (!name) return;
    try {
      const created = await apiClient.createSession({ campaignId: selectedCampaign.id, mapId: selectedMap.id, name });
      setActiveSession(created);
      setSessionMode('dm');
      await refreshLobby();
      setStatusMessage('Session started!');
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleJoinSession = async (session: LobbySessionSummary) => {
    setActiveSession(session as SessionRecord);
    setSessionMode(session.hostId === user?.id ? 'dm' : 'player');
    if (!selectedMap || selectedMap.id !== session.mapId) {
      try {
        const map = await apiClient.getMap(session.mapId);
        setSelectedMap(map);
      } catch (err) {
        console.error(err);
      }
    }
    try {
      const mapRegions = await apiClient.getRegions(session.mapId);
      const mapMarkers = await apiClient.getMarkers(session.mapId);
      setRegions(mapRegions);
      setMarkers(mapMarkers);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveSession = () => {
    setActiveSession(null);
    setSessionMode('dm');
  };

  const handleSaveSession = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      const key = await apiClient.saveSession(activeSession.id);
      setStatusMessage(`Backup saved to ${key}`);
    } catch (err) {
      setStatusMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!window.confirm('End the session for all players?')) return;
    try {
      await apiClient.endSession(activeSession.id);
      setStatusMessage('Session ended');
      setActiveSession(null);
      await refreshLobby();
    } catch (err) {
      setStatusMessage((err as Error).message);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setCampaigns([]);
    setMaps([]);
    setSelectedCampaign(null);
    setSelectedMap(null);
    setRegions([]);
    setMarkers([]);
    setActiveSession(null);
    setLobbySessions([]);
  };

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <header className="px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <h1 className="text-2xl font-bold text-primary">TITLE</h1>
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {themeLabel}
            </button>
          </div>
        </header>
        <AuthPanel onAuthenticate={handleAuthenticated} />
      </div>
    );
  }

  if (activeSession) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary">D&D Map Reveal</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Logged in as {user.displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {themeLabel}
            </button>
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
        {statusMessage && (
          <div className="mb-4 rounded border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {statusMessage}
          </div>
        )}
        <SessionViewer
          session={activeSession}
          mapImageUrl={selectedMap ? apiClient.buildMapDisplayUrl(selectedMap.id) : undefined}
          mapWidth={selectedMap?.width}
          mapHeight={selectedMap?.height}
          regions={regions}
          baseMarkers={markers}
          mode={sessionMode}
          user={user}
          onLeave={handleLeaveSession}
          onSaveSession={sessionMode === 'dm' ? handleSaveSession : undefined}
          onEndSession={sessionMode === 'dm' ? handleEndSession : undefined}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-16 dark:bg-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-primary">D&D Map Reveal</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Welcome, {user.displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {themeLabel}
            </button>
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto mt-8 grid max-w-6xl gap-8 px-6 md:grid-cols-3">
        <section className="md:col-span-1 space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Campaigns</h2>
              <button className="text-xs text-primary hover:underline" onClick={handleCreateCampaign}>
                New
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <button
                    onClick={() => setSelectedCampaign(campaign)}
                    className={`w-full rounded px-3 py-2 text-left ${
                      selectedCampaign?.id === campaign.id
                        ? 'bg-primary/10 font-medium text-primary'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {campaign.name}
                  </button>
                </li>
              ))}
              {campaigns.length === 0 && <li className="text-xs text-slate-500">Create your first campaign.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Maps</h2>
              <button className="text-xs text-primary hover:underline" onClick={handleCreateMap}>
                New
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {maps.map((map) => (
                <li key={map.id}>
                  <button
                    onClick={() => setSelectedMap(map)}
                    className={`w-full rounded px-3 py-2 text-left ${
                      selectedMap?.id === map.id ? 'bg-primary/10 font-medium text-primary' : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {map.name}
                  </button>
                </li>
              ))}
              {maps.length === 0 && <li className="text-xs text-slate-500">No maps yet.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sessions</h2>
              <button className="text-xs text-primary hover:underline" onClick={handleStartSession}>
                Start
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {mySessions.map((session) => (
                <li key={session.id}>
                  <button
                    onClick={() => handleJoinSession(session)}
                    className="w-full rounded px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    {session.name}
                  </button>
                </li>
              ))}
              {mySessions.length === 0 && <li className="text-xs text-slate-500">No active sessions.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Lobby</h2>
              <button className="text-xs text-primary hover:underline" onClick={refreshLobby}>
                Refresh
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {lobbySessions.map((session) => (
                <li key={session.id}>
                  <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
                    <p className="font-medium">{session.name}</p>
                    <p className="text-xs text-slate-500">Campaign: {session.campaignName}</p>
                    <p className="text-xs text-slate-500">Map: {session.mapName}</p>
                    <button
                      className="mt-2 w-full rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-dark"
                      onClick={() => handleJoinSession(session)}
                    >
                      Join as {session.hostId === user.id ? 'DM' : 'Player'}
                    </button>
                  </div>
                </li>
              ))}
              {lobbySessions.length === 0 && <li className="text-xs text-slate-500">No active sessions available.</li>}
            </ul>
          </div>
        </section>
        <section className="md:col-span-2 space-y-6">
          {statusMessage && (
            <div className="rounded border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {statusMessage}
            </div>
          )}
          {selectedMap ? (
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{selectedMap.name}</h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>Regions: {regions.length}</span>
                    <span>Markers: {markers.length}</span>
                  </div>
                </div>
                <MapMaskCanvas
                  imageUrl={selectedMap ? apiClient.buildMapDisplayUrl(selectedMap.id) : undefined}
                  width={selectedMap.width}
                  height={selectedMap.height}
                  regions={regions}
                  revealedRegionIds={[]}
                  markers={markers}
                  mode="dm"
                />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Regions</h3>
                    <button className="text-xs text-primary hover:underline" onClick={handleCreateRegion}>
                      Add
                    </button>
                  </div>
                  <RegionList regions={regions} revealedRegionIds={[]} />
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow dark:border-slate-700 dark:bg-slate-800">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Markers</h3>
                    <button className="text-xs text-primary hover:underline" onClick={handleCreateMarker}>
                      Add
                    </button>
                  </div>
                  <MarkerPanel markers={markers} />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500">
              Select or create a map to begin building your encounter.
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
