import React, { useEffect, useMemo, useState } from "react";
import { apiClient, ApiSession } from "../api/client";
import MapStage from "../components/MapStage";
import SessionSidebar from "../components/SessionSidebar";
import { useSessionSocket } from "../hooks/useSessionSocket";

const PlayPage: React.FC = () => {
  const [lobby, setLobby] = useState<ApiSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("Adventurer");
  const [status, setStatus] = useState<string | null>(null);

  const sessionSocket = useSessionSocket(activeSessionId, { name: displayName, role: "player" });

  useEffect(() => {
    const loadLobby = async () => {
      try {
        const sessions = await apiClient.listLobby();
        setLobby(sessions);
        if (sessions.length > 0) {
          setSelectedSessionId((prev) => prev || sessions[0].id);
        }
      } catch (err) {
        setStatus((err as Error).message);
      }
    };
    loadLobby();
    const interval = setInterval(loadLobby, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = () => {
    if (!selectedSessionId) return;
    setActiveSessionId(selectedSessionId);
    setStatus(`Joined session ${selectedSessionId}`);
  };

  const sessionState = sessionSocket.state;
  const revealedCount = sessionState?.revealedRegions?.length ?? 0;
  const markerCount = Object.keys(sessionState?.markers ?? {}).length;

  const map = sessionState?.map ?? null;
  const regions = sessionState?.regions ?? [];
  const markers = sessionState?.markers ?? {};
  const revealed = sessionState?.revealedRegions ?? [];

  const lobbyDetails = useMemo(() => lobby.find((s) => s.id === selectedSessionId) ?? null, [lobby, selectedSessionId]);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Player Portal</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Join a live tabletop reveal session from your Dungeon Master.</p>
          </div>
          <div className="text-sm font-medium text-emerald-600 dark:text-emerald-300">{status}</div>
        </header>
        <div className="grid gap-4 md:grid-cols-4">
          <label className="md:col-span-2">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Display name</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="md:col-span-2">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Active lobby session</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white/90 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900"
            >
              {lobby.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleJoin}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
          >
            Join Session
          </button>
          <div className="rounded-lg border border-slate-200 bg-white/60 p-4 text-xs dark:border-slate-700 dark:bg-slate-800/60">
            <div className="font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Session Stats</div>
            <dl className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <dt>Revealed regions</dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-100">{revealedCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Markers live</dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-100">{markerCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Connection</dt>
                <dd className="font-semibold text-slate-900 dark:text-slate-100">{sessionSocket.connection}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <MapStage map={map} regions={regions} revealedRegionIds={revealed} markers={markers} />
        <SessionSidebar
          players={sessionSocket.players}
          lastEvent={sessionSocket.lastEvent}
          connection={sessionSocket.connection}
          onReconnect={sessionSocket.reconnect}
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white/70 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">How the reveal works</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            <h3 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-100">1. Watch the fog clear</h3>
            Your DM reveals regions in real time. The mask above uses a destination-out canvas to uncover art seamlessly in your browser.
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            <h3 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-100">2. React to markers</h3>
            Markers appear as the party interacts with the dungeon. Hover or tap to see titles supplied by your storyteller.
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/70 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            <h3 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-100">3. Stay synced</h3>
            Durable Objects stream updates so every player sees the same battlefield. If you disconnect, reconnect with one tap.
          </div>
        </div>
        {lobbyDetails && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200">
            <div className="font-semibold">Currently selected: {lobbyDetails.name}</div>
            <div>Campaign ID: {lobbyDetails.campaignId}</div>
            <div>Map ID: {lobbyDetails.mapId}</div>
          </div>
        )}
      </section>
    </div>
  );
};

export default PlayPage;
