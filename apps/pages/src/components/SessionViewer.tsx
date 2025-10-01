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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{session.name}</h2>
            <p className="text-sm text-amber-700 dark:text-amber-200/80">
              Connection: <span className="font-semibold text-primary">{connectionState}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'dm' && (
              <>
                <button
                  className="rounded-full border border-amber-300/70 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700 transition hover:bg-amber-50/70 dark:border-amber-500/40 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:bg-amber-500/10"
                  onClick={onSaveSession}
                >
                  Save Snapshot
                </button>
                <button
                  className="rounded-full border border-rose-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-rose-100 transition hover:bg-rose-500/20"
                  onClick={onEndSession}
                >
                  End Session
                </button>
              </>
            )}
            <button
              className="rounded-full border border-amber-300/70 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-700 transition hover:bg-amber-50/70 dark:border-amber-500/40 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:bg-amber-500/10"
              onClick={onLeave}
            >
              Leave
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
      </div>
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.4em] text-amber-400">Players</h3>
          <ul className="space-y-1 text-sm">
            {state.players.map((player) => (
              <li key={player.id} className="rounded-xl border border-amber-200/50 bg-white/70 px-3 py-1 text-slate-800 shadow-sm shadow-amber-500/10 dark:border-amber-500/30 dark:bg-slate-950/60 dark:text-amber-50">
                <span className="font-semibold">{player.name}</span>
                <span className="ml-2 text-xs uppercase tracking-[0.2em] text-amber-500 dark:text-amber-200/80">{player.role}</span>
              </li>
            ))}
            {state.players.length === 0 && <li className="text-xs text-amber-600 dark:text-amber-200/70">Waiting for players…</li>}
          </ul>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.4em] text-amber-400">Regions</h3>
          <RegionList
            regions={regions}
            revealedRegionIds={state.revealedRegions}
            onToggleRegion={mode === 'dm' ? handleToggleRegion : undefined}
          />
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.4em] text-amber-400">Markers</h3>
          <MarkerPanel markers={resolvedMarkers} onRemove={mode === 'dm' ? handleRemoveMarker : undefined} onUpdate={mode === 'dm' ? handleUpdateMarker : undefined} />
        </section>
      </div>
    </div>
  );
};

export default SessionViewer;
