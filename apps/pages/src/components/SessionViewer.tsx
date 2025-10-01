import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { Marker, Region, SessionRecord, SessionState, User } from '../types';
import MapMaskCanvas from './MapMaskCanvas';
import MarkerPanel from './MarkerPanel';
import RegionList from './RegionList';

interface SessionViewerProps {
  session: SessionRecord;
  mapImageUrl?: string | null;
  mapWidth?: number | null;
  mapHeight?: number | null;
  regions: Region[];
  baseMarkers?: Marker[];
  mode: 'dm' | 'player';
  user: User | null;
  onLeave?: () => void;
  onSaveSession?: () => void;
  onEndSession?: () => void;
}

const emptyState: SessionState = {
  sessionId: null,
  campaignId: null,
  mapId: null,
  hostId: null,
  name: null,
  status: 'idle',
  revealedRegions: [],
  markers: {},
  metadata: {},
  players: [],
  lastUpdated: undefined,
};

const SessionViewer: React.FC<SessionViewerProps> = ({
  session,
  mapImageUrl,
  mapWidth,
  mapHeight,
  regions,
  baseMarkers = [],
  mode,
  user,
  onLeave,
  onSaveSession,
  onEndSession,
}) => {
  const [state, setState] = useState<SessionState>({ ...emptyState, markers: Object.fromEntries(baseMarkers.map((marker) => [marker.id, marker])) });
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setState((prev) => ({ ...prev, markers: Object.fromEntries(baseMarkers.map((marker) => [marker.id, marker])) }));
  }, [baseMarkers]);

  useEffect(() => {
    if (!session?.id) return;
    const url = apiClient.buildWebSocketUrl(session.id, {
      role: mode,
      name: user?.displayName,
    });
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setConnectionState('connecting');
    ws.onopen = () => {
      setConnectionState('open');
      ws.send(
        JSON.stringify({
          type: 'join',
          name: user?.displayName,
          role: mode,
        })
      );
    };
    ws.onclose = () => {
      setConnectionState('closed');
    };
    ws.onerror = () => setConnectionState('closed');
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        switch (message.type) {
          case 'state':
            setState(message.payload as SessionState);
            break;
          case 'regionsRevealed':
            setState((prev) => ({
              ...prev,
              revealedRegions: Array.from(new Set([...prev.revealedRegions, ...message.payload.regionIds])),
            }));
            break;
          case 'regionsHidden':
            setState((prev) => ({
              ...prev,
              revealedRegions: prev.revealedRegions.filter((id) => !message.payload.regionIds.includes(id)),
            }));
            break;
          case 'markerAdded':
            setState((prev) => ({
              ...prev,
              markers: { ...prev.markers, [message.payload.marker.id]: message.payload.marker },
            }));
            break;
          case 'markerUpdated':
            setState((prev) => ({
              ...prev,
              markers: { ...prev.markers, [message.payload.marker.id]: message.payload.marker },
            }));
            break;
          case 'markerRemoved':
            setState((prev) => {
              const next = { ...prev.markers };
              delete next[message.payload.markerId];
              return { ...prev, markers: next };
            });
            break;
          case 'players':
            setState((prev) => ({ ...prev, players: message.payload.players }));
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse message', err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setConnectionState('closed');
    };
  }, [session.id, mode, user?.displayName]);

  const sendMessage = (payload: unknown) => {
    if (wsRef.current && connectionState === 'open') {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const handleToggleRegion = (regionId: string, nextState: boolean) => {
    sendMessage({ type: nextState ? 'revealRegions' : 'hideRegions', regionIds: [regionId] });
  };

  const handlePlaceMarker = (coords: { x: number; y: number }) => {
    const label = window.prompt('Marker label', 'Marker');
    if (!label) return;
    const color = window.prompt('Marker color (hex)', '#facc15') || '#facc15';
    sendMessage({ type: 'placeMarker', marker: { label, x: coords.x, y: coords.y, color } });
  };

  const handleRemoveMarker = (markerId: string) => {
    if (window.confirm('Remove marker?')) {
      sendMessage({ type: 'removeMarker', markerId });
    }
  };

  const handleUpdateMarker = (marker: Marker) => {
    const label = window.prompt('Marker label', marker.label) || marker.label;
    const color = window.prompt('Marker color (hex)', marker.color || '#facc15') || marker.color || '#facc15';
    sendMessage({ type: 'updateMarker', marker: { ...marker, label, color } });
  };

  const resolvedMarkers = useMemo(() => Object.values(state.markers || {}), [state.markers]);

  return (
    <div className="grid grid-cols-1 gap-6 text-slate-900 dark:text-slate-100 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/60 bg-white/60 px-5 py-4 shadow-lg shadow-amber-500/10 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/60 dark:shadow-black/40">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">Active Session</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{session.name}</h2>
            <p className="mt-2 flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
              Connection
              <span className="inline-flex items-center rounded-full border border-amber-400/70 bg-amber-200/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                {connectionState}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === 'dm' && (
              <>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-amber-400/70 bg-amber-200/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:bg-amber-200/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/20"
                  onClick={onSaveSession}
                >
                  Save Snapshot
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-rose-400/70 bg-rose-200/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-700 transition hover:bg-rose-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                  onClick={onEndSession}
                >
                  End Session
                </button>
              </>
            )}
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
              onClick={onLeave}
            >
              Leave
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-white/60 bg-white/50 p-3 shadow-2xl shadow-amber-500/10 backdrop-blur-lg dark:border-slate-800/70 dark:bg-slate-950/60 dark:shadow-black/40">
          <MapMaskCanvas
            imageUrl={mapImageUrl}
            width={mapWidth}
            height={mapHeight}
            regions={regions}
            revealedRegionIds={state.revealedRegions}
            markers={state.markers}
            mode={mode}
            onToggleRegion={handleToggleRegion}
            onPlaceMarker={mode === 'dm' ? handlePlaceMarker : undefined}
          />
        </div>
      </div>
      <div className="space-y-5">
        <section className="rounded-3xl border border-white/60 bg-white/55 p-4 shadow-lg shadow-amber-500/10 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/60 dark:shadow-black/40">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">Players</h3>
          <ul className="space-y-2 text-sm">
            {state.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-slate-700 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <span className="font-semibold text-slate-900 dark:text-white">{player.name}</span>
                <span className="rounded-full border border-amber-400/60 bg-amber-200/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-200">
                  {player.role}
                </span>
              </li>
            ))}
            {state.players.length === 0 && (
              <li className="text-xs text-slate-500 dark:text-slate-400">Waiting for players…</li>
            )}
          </ul>
        </section>
        <section className="rounded-3xl border border-white/60 bg-white/55 p-4 shadow-lg shadow-amber-500/10 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/60 dark:shadow-black/40">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">Regions</h3>
          <RegionList
            regions={regions}
            revealedRegionIds={state.revealedRegions}
            onToggleRegion={mode === 'dm' ? handleToggleRegion : undefined}
          />
        </section>
        <section className="rounded-3xl border border-white/60 bg-white/55 p-4 shadow-lg shadow-amber-500/10 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/60 dark:shadow-black/40">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">Markers</h3>
          <MarkerPanel
            markers={resolvedMarkers}
            onRemove={mode === 'dm' ? handleRemoveMarker : undefined}
            onUpdate={mode === 'dm' ? handleUpdateMarker : undefined}
          />
        </section>
      </div>
    </div>
  );
};

export default SessionViewer;
