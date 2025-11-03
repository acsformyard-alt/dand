import React, { useMemo, useState } from 'react';
import type { Marker, Region, SessionRecord } from '../types';

interface DMSessionViewerProps {
  session: SessionRecord;
  mapImageUrl?: string | null;
  mapWidth?: number | null;
  mapHeight?: number | null;
  regions: Region[];
  markers?: Marker[];
  onSaveSnapshot?: () => void;
  onEndSession?: () => void;
}

const tabs = ['Rooms', 'Markers', 'Other'] as const;

type TabKey = (typeof tabs)[number];
type PositionedMarker = { marker: Marker; left: number; top: number; initials: string };

const DMSessionViewer: React.FC<DMSessionViewerProps> = ({
  session,
  mapImageUrl,
  mapWidth,
  mapHeight,
  regions,
  markers = [],
  onSaveSnapshot,
  onEndSession,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('Rooms');
  const [viewMode, setViewMode] = useState<'dm' | 'playerPreview'>('dm');
  const snapshotDisabled = !onSaveSnapshot;
  const endSessionDisabled = !onEndSession;

  const handleToggleViewMode = () => {
    setViewMode((prev) => (prev === 'dm' ? 'playerPreview' : 'dm'));
  };

  const markerPositions = useMemo(() => {
    if (!markers.length) {
      return [] as PositionedMarker[];
    }

    if (!mapWidth || !mapHeight) {
      return markers.map((marker, index): PositionedMarker => ({
        marker,
        left: ((index + 1) / (markers.length + 1)) * 100,
        top: 50,
        initials: (marker.label?.trim() || 'MK').slice(0, 2).toUpperCase(),
      }));
    }

    return markers.map((marker): PositionedMarker => ({
      marker,
      left: Math.min(100, Math.max(0, (marker.x / mapWidth) * 100)),
      top: Math.min(100, Math.max(0, (marker.y / mapHeight) * 100)),
      initials: (marker.label?.trim() || 'MK').slice(0, 2).toUpperCase(),
    }));
  }, [markers, mapHeight, mapWidth]);

  return (
    <section className="flex h-[75vh] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/70 text-slate-900 shadow-2xl shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-100 dark:shadow-black/40">
      <header className="flex items-center justify-between gap-3 border-b border-white/50 bg-white/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-700 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/70 dark:text-slate-300">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-full border border-amber-400/70 bg-amber-200/60 px-3 py-1 text-slate-900 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100">
            DM Session
          </span>
          <span className="truncate text-[9px] tracking-[0.3em] text-slate-500 dark:text-slate-400">{session.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
              snapshotDisabled
                ? 'cursor-not-allowed border-slate-400/40 bg-white/40 text-slate-400 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-600'
                : 'border-amber-400/70 bg-amber-200/70 text-slate-900 hover:bg-amber-200/90 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30'
            }`}
            onClick={onSaveSnapshot}
            disabled={snapshotDisabled}
          >
            Save Snapshot
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-500/40 bg-white/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-700 transition hover:border-amber-400/60 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-amber-400/70 dark:hover:text-amber-200"
          >
            View Players
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 ${
              endSessionDisabled
                ? 'cursor-not-allowed border-slate-400/40 bg-white/40 text-slate-400 dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-600'
                : 'border-rose-400/70 bg-rose-200/50 text-rose-700 hover:bg-rose-200/70 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30'
            }`}
            onClick={onEndSession}
            disabled={endSessionDisabled}
          >
            End Session
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div
          className={`relative flex-[4] overflow-hidden border-r border-white/40 bg-slate-950/70 transition dark:border-slate-800/70 ${
            viewMode === 'playerPreview' ? 'saturate-75' : ''
          }`}
        >
          <div className="absolute left-4 top-4 z-20">
            <button
              type="button"
              onClick={handleToggleViewMode}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/80 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-800 shadow-lg shadow-amber-500/20 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-800/70 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-black/40"
              aria-pressed={viewMode === 'playerPreview'}
              aria-label="Toggle player preview"
            >
              {viewMode === 'dm' ? 'DM' : 'PLY'}
            </button>
          </div>
          <div className="absolute inset-0">
            {mapImageUrl ? (
              <img
                src={mapImageUrl}
                alt={session.mapName ?? 'Session Map'}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-900/80 text-sm uppercase tracking-[0.3em] text-slate-300">
                No map selected
              </div>
            )}
          </div>
          <div className="pointer-events-none absolute inset-0">
            {markerPositions.map(({ marker, left, top, initials }) => (
              <div
                key={marker.id}
                className="absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white/80 bg-amber-400/90 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-900 shadow-lg shadow-amber-500/40"
                style={{ left: `${left}%`, top: `${top}%` }}
                title={marker.label ?? 'Marker'}
              >
                {initials}
              </div>
            ))}
            <div className="absolute left-4 top-20 flex flex-col gap-2">
              {regions.map((region, index) => (
                <div
                  key={region.id}
                  className="flex items-center gap-2 rounded-full border border-white/50 bg-slate-900/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-white shadow-lg shadow-amber-500/20 backdrop-blur"
                  style={{ marginLeft: `${index % 2 === 0 ? 0 : 12}px` }}
                  title={region.name}
                >
                  {region.name}
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="flex flex-[1] flex-col border-l border-white/40 bg-white/60 px-3 py-4 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-1 rounded-full border border-white/40 bg-white/70 p-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-600 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-300">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 rounded-full px-3 py-2 transition ${
                  activeTab === tab
                    ? 'bg-amber-300/80 text-slate-900 shadow-lg shadow-amber-500/30 dark:bg-amber-400/30 dark:text-amber-100'
                    : 'text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-200'
                }`}
                aria-pressed={activeTab === tab}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="mt-4 flex-1 rounded-3xl border border-dashed border-white/40 bg-white/40 dark:border-slate-800/70 dark:bg-slate-950/60" aria-live="polite" aria-label={`${activeTab} panel`} />
        </aside>
      </div>
    </section>
  );
};

export default DMSessionViewer;
