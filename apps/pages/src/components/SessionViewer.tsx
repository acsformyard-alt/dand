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

  const connectionBadgeClass = useMemo(() => {
    const base =
      'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] shadow transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
    switch (connectionState) {
      case 'open':
        return (
          base +
          ' border border-emerald-400/70 bg-emerald-300/60 text-emerald-900 focus-visible:outline-emerald-400 dark:border-emerald-400/50 dark:bg-emerald-400/15 dark:text-emerald-100'
        );
      case 'connecting':
        return (
          base +
          ' border border-amber-400/70 bg-amber-300/80 text-slate-900 focus-visible:outline-amber-400 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-100'
        );
      case 'closed':
        return (
          base +
          ' border border-rose-400/70 bg-rose-200/60 text-rose-700 focus-visible:outline-rose-400 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100'
        );
      default:
        return (
          base +
          ' border border-white/60 bg-white/70 text-slate-700 focus-visible:outline-slate-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200'
        );
    }
  }, [connectionState]);

  const connectionLabel = useMemo(() => {
    switch (connectionState) {
      case 'open':
        return 'Live';
      case 'connecting':
        return 'Connecting';
      case 'closed':
        return 'Disconnected';
      default:
        return 'Idle';
    }
  }, [connectionState]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/60 bg-white/70 px-5 py-4 shadow-lg shadow-amber-500/20 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-amber-600 dark:text-amber-200">Live Session</p>
            <h2 className="text-2xl font-black uppercase tracking-wide text-slate-900 dark:text-white">{session.name}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={connectionBadgeClass}>{connectionLabel}</span>
            {mode === 'dm' && (
              <>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-teal-400/70 bg-teal-300/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-900 transition hover:bg-teal-300/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400 dark:border-teal-400/50 dark:bg-teal-400/15 dark:text-teal-100 dark:hover:bg-teal-400/25"
                  onClick={onSaveSession}
                >
                  Save Snapshot
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-full border border-rose-400/70 bg-rose-200/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-700 transition hover:bg-rose-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                  onClick={onEndSession}
                >
                  End Session
                </button>
              </>
            )}
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-700 transition hover:border-amber-400/60 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/50 dark:hover:text-amber-200"
              onClick={onLeave}
            >
              Leave Session
            </button>
          </div>
        </div>
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
      </section>
      <aside className="space-y-5">
        <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-amber-500/20 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
          <h3 className="text-xs uppercase tracking-[0.4em] text-slate-600 dark:text-slate-400">Players</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {state.players.map((player) => (
              <li
                key={player.id}
                className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-2 text-sm text-slate-800 shadow-sm shadow-amber-500/10 dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-100"
              >
                <span className="font-semibold">{player.name}</span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">{player.role}</span>
              </li>
            ))}
            {state.players.length === 0 && (
              <li className="rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-400">
                Waiting for players…
              </li>
            )}
          </ul>
        </section>
        <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-amber-500/20 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
          <h3 className="text-xs uppercase tracking-[0.4em] text-slate-600 dark:text-slate-400">Regions</h3>
          <div className="mt-3">
            <RegionList
              regions={regions}
              revealedRegionIds={state.revealedRegions}
              onToggleRegion={mode === 'dm' ? handleToggleRegion : undefined}
            />
          </div>
        </section>
        <section className="rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-amber-500/20 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
          <h3 className="text-xs uppercase tracking-[0.4em] text-slate-600 dark:text-slate-400">Markers</h3>
          <div className="mt-3">
            <MarkerPanel
              markers={resolvedMarkers}
              onRemove={mode === 'dm' ? handleRemoveMarker : undefined}
              onUpdate={mode === 'dm' ? handleUpdateMarker : undefined}
            />
          </div>
        </section>
      </aside>
    </div>
  );
};

export default SessionViewer;
