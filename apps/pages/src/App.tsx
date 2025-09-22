import React, { useCallback, useEffect, useMemo, useState } from 'react';
import SessionViewer from './components/SessionViewer';
import MapMaskCanvas from './components/MapMaskCanvas';
import { apiClient } from './api/client';
import MapCreationWizard from './components/MapCreationWizard';
import MapFolderList from './components/MapFolderList';
import LandingPage from './components/LandingPage';
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

const getMapMetadataString = (map: MapRecord | null, key: string) => {
  const value = map?.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
};

const getMapMetadataStringArray = (map: MapRecord | null, key: string) => {
  const value = map?.metadata?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

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
  const [activeView, setActiveView] = useState<'join' | 'manage' | 'create' | 'admin'>('join');
  const [joinKey, setJoinKey] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDescription, setNewCampaignDescription] = useState('');
  const [newCampaignPublic, setNewCampaignPublic] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showMapWizard, setShowMapWizard] = useState(false);

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

  const refreshCampaigns = useCallback(
    async (authToken?: string) => {
      const effectiveToken = authToken ?? token;
      if (!effectiveToken) return;
      if (authToken && authToken !== token) {
        apiClient.setToken(authToken);
      }
      try {
        const list = await apiClient.getCampaigns();
        setCampaigns(list);
        setSelectedCampaign((current) => {
          if (list.length === 0) {
            return null;
          }
          if (!current) {
            return list[0];
          }
          const existing = list.find((entry) => entry.id === current.id);
          return existing ?? list[0];
        });
      } catch (err) {
        console.error(err);
        setStatusMessage((err as Error).message);
      }
    },
    [token]
  );

  const refreshLobby = useCallback(async () => {
    try {
      const sessions = await apiClient.getLobby();
      setLobbySessions(sessions);
      return sessions;
    } catch (err) {
      console.error(err);
      setStatusMessage((err as Error).message);
      return [] as LobbySessionSummary[];
    }
  }, []);

  const handleAuthenticated = async (response: AuthResponse) => {
    apiClient.setToken(response.token);
    setToken(response.token);
    setUser(response.user);
    setStatusMessage('Welcome back!');
    setActiveView('join');
    await refreshCampaigns(response.token);
    await refreshLobby();
  };

  const fetchMapsForSelectedCampaign = useCallback(async () => {
    if (!selectedCampaign) return;
    try {
      const campaignMaps = await apiClient.getMapsForCampaign(selectedCampaign.id);
      setMaps(campaignMaps);
      if (campaignMaps.length > 0) {
        setSelectedMap((previous) => {
          if (!previous) {
            return campaignMaps[0];
          }
          const existing = campaignMaps.find((map) => map.id === previous.id);
          return existing ?? campaignMaps[0];
        });
      } else {
        setSelectedMap(null);
        setRegions([]);
        setMarkers([]);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedCampaign]);

  useEffect(() => {
    if (token) {
      refreshCampaigns();
      refreshLobby();
    }
  }, [refreshCampaigns, refreshLobby, token]);

  useEffect(() => {
    fetchMapsForSelectedCampaign();
  }, [fetchMapsForSelectedCampaign]);

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

  useEffect(() => {
    if (activeView === 'admin' && !selectedCampaign) {
      setActiveView('manage');
    }
  }, [activeView, selectedCampaign]);

  const handleCreateCampaign = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const trimmedName = newCampaignName.trim();
    const trimmedDescription = newCampaignDescription.trim();
    if (!trimmedName) {
      setCreateError('Please enter a campaign name.');
      return;
    }
    try {
      setCreateError(null);
      const created = await apiClient.createCampaign({
        name: trimmedName,
        description: trimmedDescription ? trimmedDescription : undefined,
        isPublic: newCampaignPublic,
      });
      setCampaigns((prev) => [created, ...prev]);
      setSelectedCampaign(created);
      setActiveView('admin');
      setNewCampaignName('');
      setNewCampaignDescription('');
      setNewCampaignPublic(false);
      setStatusMessage('Campaign created');
    } catch (err) {
      setCreateError((err as Error).message);
    }
  };

  const handleOpenMapWizard = () => {
    if (!selectedCampaign) return;
    setShowMapWizard(true);
  };

  const handleCloseMapWizard = () => {
    setShowMapWizard(false);
  };

  const handleMapWizardComplete = (map: MapRecord, createdMarkers: Marker[], createdRegions: Region[]) => {
    setMaps((previous) => {
      const without = previous.filter((entry) => entry.id !== map.id);
      return [map, ...without];
    });
    setSelectedMap(map);
    setRegions(createdRegions);
    setMarkers(createdMarkers);
    fetchMapsForSelectedCampaign();
    setStatusMessage('Map created successfully.');
    setShowMapWizard(false);
  };

  const handleJoinByKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = joinKey.trim();
    if (!key) {
      setJoinError('Enter a campaign key to continue.');
      return;
    }
    try {
      setJoinError(null);
      const sessions = await refreshLobby();
      const normalizedKey = key.toLowerCase();
      const session =
        sessions.find((item) => item.id === key) ||
        sessions.find((item) => item.campaignId === key) ||
        sessions.find((item) => item.name?.toLowerCase() === normalizedKey);
      if (!session) {
        setJoinError('No campaign room found with that key.');
        return;
      }
      await handleJoinSession(session);
      setJoinKey('');
      setStatusMessage('Joining campaign room…');
    } catch (err) {
      setJoinError((err as Error).message);
    }
  };

  const handleOpenCampaignAdmin = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setActiveView('admin');
  };

  const handleBackToManage = () => {
    setActiveView('manage');
  };

  const handleDeleteCampaign = async () => {
    if (!selectedCampaign) return;
    const confirmDelete = window.confirm(
      `Delete campaign "${selectedCampaign.name}"? This will remove all associated maps and sessions.`,
    );
    if (!confirmDelete) return;
    try {
      await apiClient.deleteCampaign(selectedCampaign.id);
      await refreshCampaigns();
      setSelectedCampaign(null);
      setSelectedMap(null);
      setMaps([]);
      setRegions([]);
      setMarkers([]);
      setActiveView('manage');
      setStatusMessage('Campaign deleted.');
    } catch (err) {
      console.error(err);
      setStatusMessage((err as Error).message);
    }
  };

  const handleDeleteMap = async (map: MapRecord) => {
    const confirmDelete = window.confirm(
      `Delete map "${map.name}"? This will remove all associated regions and markers.`,
    );
    if (!confirmDelete) {
      return;
    }
    try {
      await apiClient.deleteMap(map.id);
      const wasSelected = selectedMap?.id === map.id;
      let remainingMaps: MapRecord[] = [];
      setMaps((previous) => {
        const filtered = previous.filter((entry) => entry.id !== map.id);
        remainingMaps = filtered;
        return filtered;
      });
      if (wasSelected) {
        const nextMap = remainingMaps[0] ?? null;
        setSelectedMap(nextMap ?? null);
        if (nextMap) {
          setRegions([]);
          setMarkers([]);
          try {
            const [nextRegions, nextMarkers] = await Promise.all([
              apiClient.getRegions(nextMap.id),
              apiClient.getMarkers(nextMap.id),
            ]);
            setRegions(nextRegions);
            setMarkers(nextMarkers);
          } catch (loadErr) {
            console.error(loadErr);
            setStatusMessage('Map deleted, but failed to load the next map details.');
            return;
          }
        } else {
          setRegions([]);
          setMarkers([]);
        }
      }
      setStatusMessage('Map deleted.');
    } catch (err) {
      console.error(err);
      setStatusMessage((err as Error).message);
    }
  };

  const mySessions = useMemo(() => lobbySessions.filter((session) => session.hostId === user?.id), [lobbySessions, user?.id]);
  const mapDescription = useMemo(() => getMapMetadataString(selectedMap, 'description'), [selectedMap]);
  const mapNotes = useMemo(() => getMapMetadataString(selectedMap, 'notes'), [selectedMap]);
  const mapGrouping = useMemo(() => {
    const groupingValue = getMapMetadataString(selectedMap, 'grouping') ?? getMapMetadataString(selectedMap, 'group');
    return groupingValue ?? 'Ungrouped Maps';
  }, [selectedMap]);
  const mapTags = useMemo(() => getMapMetadataStringArray(selectedMap, 'tags'), [selectedMap]);

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
    apiClient.setToken(null);
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
    setActiveView('join');
    setJoinKey('');
    setJoinError(null);
    setNewCampaignName('');
    setNewCampaignDescription('');
    setNewCampaignPublic(false);
    setCreateError(null);
    setStatusMessage(null);
  };

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  const navButtonClasses = (view: 'join' | 'manage' | 'create' | 'admin') =>
    `group flex w-full items-center justify-between rounded-2xl border px-5 py-4 text-left text-sm font-semibold uppercase tracking-[0.3em] transition ${
      activeView === view
        ? 'border-teal-400 bg-teal-400/90 text-slate-900 shadow-lg shadow-teal-500/40'
        : 'border-slate-800/70 bg-slate-900/60 text-slate-300 hover:border-teal-400/60 hover:bg-slate-800/80'
    }`;

  if (!token || !user) {
    return <LandingPage theme={theme} setTheme={setTheme} onAuthenticate={handleAuthenticated} />;
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:py-12">
        <aside className="flex flex-col gap-6 rounded-3xl border border-slate-800/70 bg-slate-950/70 p-6 shadow-2xl md:w-72">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Mission Control</p>
            <h2 className="mt-3 text-2xl font-black uppercase tracking-wide text-teal-300">Command Deck</h2>
          </div>
          <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-[0.5em] text-slate-500">Logged in</p>
            <p className="mt-2 text-lg font-semibold text-white">{user.displayName}</p>
            <p className="text-xs text-slate-500">Ready for launch</p>
          </div>
          <nav className="space-y-3">
            <button className={navButtonClasses('join')} onClick={() => setActiveView('join')}>
              <span>Join Campaign</span>
              <span className="text-[10px] tracking-[0.4em] text-slate-900/70 transition group-hover:text-slate-900/90">START</span>
            </button>
            <button className={navButtonClasses('manage')} onClick={() => setActiveView('manage')}>
              <span>Manage Campaigns</span>
              <span className="text-[10px] tracking-[0.4em] text-slate-900/70 transition group-hover:text-slate-900/90">HANGAR</span>
            </button>
            <button className={navButtonClasses('create')} onClick={() => setActiveView('create')}>
              <span>Create Campaign</span>
              <span className="text-[10px] tracking-[0.4em] text-slate-900/70 transition group-hover:text-slate-900/90">NEW</span>
            </button>
          </nav>
          <div className="mt-auto space-y-2 text-xs text-slate-500">
            <p>Need a room code? Ask your DM to share their campaign key.</p>
            <p>Switch tabs to manage, create, or join adventures.</p>
          </div>
        </aside>
        <section className="flex-1 space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-800/70 bg-slate-950/70 px-6 py-4 shadow-xl">
            <div>
              <p className="text-xs uppercase tracking-[0.5em] text-teal-300">Campaign Control</p>
              <h1 className="text-3xl font-black uppercase tracking-wide text-white">D&D Map Reveal</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="rounded-full border border-teal-400/60 bg-teal-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-teal-200 transition hover:bg-teal-400/20"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {themeLabel}
              </button>
              <button
                className="rounded-full border border-rose-400/60 bg-rose-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/30"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </header>
          {statusMessage && (
            <div className="rounded-3xl border border-teal-500/40 bg-teal-500/10 px-5 py-3 text-sm text-teal-200 shadow-lg shadow-teal-500/10">
              {statusMessage}
            </div>
          )}
          <div className="flex-1 rounded-3xl border border-slate-800/70 bg-slate-950/70 p-6 shadow-2xl">
            {activeView === 'join' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-black uppercase tracking-wide text-teal-200">Join Campaign</h2>
                <p className="max-w-xl text-sm text-slate-300">
                  Enter the campaign key provided by your Dungeon Master to hop into their room.
                </p>
                <form onSubmit={handleJoinByKey} className="space-y-4">
                  <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">
                    Campaign Key
                    <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                      <input
                        value={joinKey}
                        onChange={(event) => setJoinKey(event.target.value)}
                        placeholder="e.g. A1B2C3"
                        className="flex-1 rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm uppercase tracking-[0.3em] text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                      />
                      <button
                        type="submit"
                        className="rounded-xl border border-teal-400/60 bg-teal-500/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                      >
                        Join Room
                      </button>
                    </div>
                  </label>
                  {joinError && <p className="text-xs font-semibold text-rose-300">{joinError}</p>}
                </form>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs uppercase tracking-[0.4em] text-slate-400">Active Rooms</h3>
                    <button
                      type="button"
                      className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-200 transition hover:text-teal-100"
                      onClick={refreshLobby}
                    >
                      Refresh
                    </button>
                  </div>
                  <ul className="max-h-48 space-y-2 overflow-y-auto pr-1 text-sm">
                    {lobbySessions.map((session) => (
                      <li key={session.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-100">{session.name}</p>
                            <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Key: {session.id}</p>
                          </div>
                          <button
                            type="button"
                            className="rounded-lg border border-teal-400/60 bg-teal-500/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
                            onClick={() => handleJoinSession(session)}
                          >
                            Join
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">
                          Campaign: {session.campaignName ?? 'Unknown'} • Map: {session.mapName ?? 'Unknown'}
                        </p>
                      </li>
                    ))}
                    {lobbySessions.length === 0 && (
                      <li className="rounded-xl border border-dashed border-slate-700/70 px-3 py-6 text-center text-xs text-slate-500">
                        No active rooms yet.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
            {activeView === 'manage' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-wide text-teal-200">Manage Campaigns</h2>
                    <p className="text-sm text-slate-300">Select a campaign to open the admin hangar.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-teal-400/60 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-teal-200 transition hover:bg-teal-500/20"
                    onClick={() => refreshCampaigns()}
                  >
                    Refresh
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      className="group flex h-full flex-col justify-between rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4 text-left transition hover:border-teal-400/60 hover:bg-slate-900/70"
                      onClick={() => handleOpenCampaignAdmin(campaign)}
                    >
                      <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Campaign</p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{campaign.name}</h3>
                        <p className="mt-2 text-xs text-slate-400">{campaign.description || 'No description provided.'}</p>
                      </div>
                      <span className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-teal-200">
                        Open Hangar <span aria-hidden>→</span>
                      </span>
                    </button>
                  ))}
                  {campaigns.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 p-6 text-center text-sm text-slate-400">
                      You haven't created any campaigns yet. Try the create tab to launch a new adventure.
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeView === 'create' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-black uppercase tracking-wide text-teal-200">Create Campaign</h2>
                <p className="max-w-xl text-sm text-slate-300">Set up a new campaign for your players and start building encounters.</p>
                <form onSubmit={handleCreateCampaign} className="space-y-5">
                  <div>
                    <label className="text-xs uppercase tracking-[0.4em] text-slate-400">Campaign Name</label>
                    <input
                      value={newCampaignName}
                      onChange={(event) => setNewCampaignName(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                      placeholder="Give your mission a title"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-[0.4em] text-slate-400">Description</label>
                    <textarea
                      value={newCampaignDescription}
                      onChange={(event) => setNewCampaignDescription(event.target.value)}
                      rows={4}
                      className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                      placeholder="Share a quick briefing for your players"
                    />
                  </div>
                  <label className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-slate-400">
                    <input
                      type="checkbox"
                      checked={newCampaignPublic}
                      onChange={(event) => setNewCampaignPublic(event.target.checked)}
                      className="h-4 w-4 rounded border border-slate-700 bg-slate-900 text-teal-400 focus:ring-teal-400"
                    />
                    <span className="text-slate-300">List publicly for players to discover</span>
                  </label>
                  {createError && <p className="text-xs font-semibold text-rose-300">{createError}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      className="rounded-xl border border-teal-400/60 bg-teal-500/80 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
                    >
                      Launch Campaign
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-slate-700/70 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-teal-400/60 hover:text-teal-200"
                      onClick={() => {
                        setNewCampaignName('');
                        setNewCampaignDescription('');
                        setNewCampaignPublic(false);
                        setCreateError(null);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </form>
              </div>
            )}
            {activeView === 'admin' && selectedCampaign && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-teal-300">Managing Campaign</p>
                    <h2 className="text-3xl font-black uppercase tracking-wide text-white">{selectedCampaign.name}</h2>
                    {selectedCampaign.description && <p className="text-sm text-slate-300">{selectedCampaign.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="rounded-full border border-slate-700/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-teal-400/60 hover:text-teal-200"
                      onClick={handleBackToManage}
                    >
                      Campaign List
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-rose-400/60 bg-rose-500/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/30"
                      onClick={handleDeleteCampaign}
                    >
                      Delete Campaign
                    </button>
                    <button
                      type="button"
                      className="rounded-full border border-teal-400/60 bg-teal-500/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
                      onClick={handleStartSession}
                    >
                      Launch Session
                    </button>
                  </div>
                </div>
                <div className="space-y-6">
                  <MapFolderList
                    maps={maps}
                    selectedMapId={selectedMap?.id ?? null}
                    onSelect={(map) => setSelectedMap(map)}
                    onCreateMap={handleOpenMapWizard}
                    onDeleteMap={handleDeleteMap}
                  />
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <div className="space-y-6">
                      {selectedMap ? (
                        <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-6">
                          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <h3 className="text-2xl font-semibold text-white">{selectedMap.name}</h3>
                              {mapDescription && <p className="mt-2 text-sm text-slate-300">{mapDescription}</p>}
                              {!mapDescription && mapNotes && <p className="mt-2 text-sm text-slate-400">{mapNotes}</p>}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.4em] text-slate-500">
                              <span>Regions: {regions.length}</span>
                              <span>Markers: {markers.length}</span>
                              <span>
                                Size: {selectedMap.width ?? '—'} × {selectedMap.height ?? '—'}
                              </span>
                            </div>
                          </div>
                          <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/70">
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
                          <div className="mt-6 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
                              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Grouping</p>
                              <p className="mt-2 text-sm font-semibold text-teal-200">{mapGrouping}</p>
                              {mapNotes && mapDescription && (
                                <p className="mt-3 text-xs text-slate-400">Notes: {mapNotes}</p>
                              )}
                            </div>
                            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
                              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Tags</p>
                              {mapTags.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {mapTags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-300"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-3 text-xs text-slate-500">No tags assigned yet.</p>
                              )}
                            </div>
                          </div>
                          {!mapDescription && !mapNotes && (
                            <p className="mt-4 text-xs text-slate-500">
                              Add details and notes through the map wizard to give your players extra context.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-700/70 p-12 text-center text-sm text-slate-400">
                          Select or create a map to begin shaping your encounter.
                        </div>
                      )}
                    </div>
                    <div className="space-y-6">
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-xs uppercase tracking-[0.4em] text-slate-400">My Sessions</h3>
                        </div>
                        <ul className="space-y-2 text-sm">
                          {mySessions.map((session) => (
                            <li key={session.id}>
                              <button
                                onClick={() => handleJoinSession(session)}
                                className="w-full rounded-xl border border-slate-800/70 bg-slate-950/60 px-3 py-2 text-left text-slate-300 transition hover:border-teal-400/60 hover:text-teal-100"
                              >
                                {session.name}
                              </button>
                            </li>
                          ))}
                          {mySessions.length === 0 && (
                            <li className="rounded-xl border border-dashed border-slate-700/70 px-3 py-6 text-center text-xs text-slate-500">
                              No active sessions.
                            </li>
                          )}
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-xs uppercase tracking-[0.4em] text-slate-400">Lobby</h3>
                          <button
                            type="button"
                            className="text-xs font-semibold uppercase tracking-[0.3em] text-teal-200 transition hover:text-teal-100"
                            onClick={refreshLobby}
                          >
                            Refresh
                          </button>
                        </div>
                        <ul className="space-y-2 text-sm">
                          {lobbySessions.map((session) => (
                            <li key={session.id} className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                              <p className="font-semibold text-slate-100">{session.name}</p>
                              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Campaign: {session.campaignName ?? 'Unknown'}</p>
                              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Map: {session.mapName ?? 'Unknown'}</p>
                              <button
                                type="button"
                                className="mt-3 w-full rounded-xl border border-teal-400/60 bg-teal-500/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
                                onClick={() => handleJoinSession(session)}
                              >
                                Join as {session.hostId === user.id ? 'DM' : 'Player'}
                              </button>
                            </li>
                          ))}
                          {lobbySessions.length === 0 && (
                            <li className="rounded-xl border border-dashed border-slate-700/70 px-3 py-6 text-center text-xs text-slate-500">
                              No active sessions available.
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeView === 'admin' && !selectedCampaign && (
              <div className="rounded-2xl border border-dashed border-slate-700/70 p-12 text-center text-sm text-slate-400">
                Choose a campaign from the manage tab to configure it here.
              </div>
            )}
          </div>
        </section>
        {showMapWizard && selectedCampaign && (
          <MapCreationWizard
            campaign={selectedCampaign}
            onClose={handleCloseMapWizard}
            onComplete={handleMapWizardComplete}
          />
        )}
      </div>
    </div>
  );
};

export default App;
