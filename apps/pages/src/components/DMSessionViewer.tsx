import React, { useMemo, useState } from 'react';
import type { Marker, Region, SessionRecord } from '../types';
import MapMaskCanvas from './MapMaskCanvas';

interface DMSessionViewerProps {
  session: SessionRecord;
  mapImageUrl?: string | null;
  mapWidth?: number | null;
  mapHeight?: number | null;
  regions: Region[];
  markers?: Marker[];
  onSaveSnapshot?: () => void;
  onEndSession?: () => void;
  onShowPlayers?: () => void;
}

const TAB_LABELS: Array<{ id: 'rooms' | 'markers' | 'other'; label: string }> = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'markers', label: 'Markers' },
  { id: 'other', label: 'Other' },
];

const DMSessionViewer: React.FC<DMSessionViewerProps> = ({
  session,
  mapImageUrl,
  mapWidth,
  mapHeight,
  regions,
  markers = [],
  onSaveSnapshot,
  onEndSession,
  onShowPlayers,
}) => {
  const [viewMode, setViewMode] = useState<'dm' | 'playerPreview'>('dm');
  const [activeTab, setActiveTab] = useState<'rooms' | 'markers' | 'other'>('rooms');

  const revealedRegionIds = useMemo(() => regions.map((region) => region.id), [regions]);

  return (
    <section className="flex h-[78vh] min-h-[540px] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-2xl shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
      <header className="flex items-center justify-between border-b border-white/60 bg-white/80 px-4 py-2 text-xs uppercase tracking-[0.35em] text-slate-700 dark:border-slate-800/60 dark:bg-slate-950/60 dark:text-slate-300">
        <div className="flex items-center gap-3 text-[11px] font-semibold">
          <span className="rounded-full border border-amber-400/70 bg-amber-200/60 px-3 py-1 text-slate-900 dark:border-amber-400/60 dark:bg-amber-400/20 dark:text-amber-100">
            DM Session
          </span>
          <span className="text-slate-600 dark:text-slate-400">{session.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveSnapshot}
            className="rounded-full border border-amber-400/70 bg-amber-200/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-900 transition hover:bg-amber-200/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/60 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
          >
            Save Snapshot
          </button>
          <button
            type="button"
            onClick={onShowPlayers}
            className="rounded-full border border-white/70 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
          >
            See Players
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="rounded-full border border-rose-500/80 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-rose-600 transition hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-400/60 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
          >
            End Session
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-[4] overflow-hidden bg-slate-900/20 dark:bg-slate-900/50">
          <div className="absolute left-4 top-4 z-10">
            <button
              type="button"
              onClick={() => setViewMode((prev) => (prev === 'dm' ? 'playerPreview' : 'dm'))}
              className="flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-800 shadow-lg shadow-amber-500/10 transition hover:border-amber-400/70 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-800/60 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" aria-hidden />
              {viewMode === 'dm' ? 'DM View' : 'Player Preview'}
            </button>
          </div>
          <div className="relative h-full w-full">
            <MapMaskCanvas
              imageUrl={mapImageUrl}
              width={mapWidth}
              height={mapHeight}
              regions={regions}
              revealedRegionIds={revealedRegionIds}
              markers={markers}
              mode={viewMode === 'dm' ? 'dm' : 'player'}
            />
            {viewMode === 'playerPreview' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/50 text-xs font-semibold uppercase tracking-[0.4em] text-slate-100">
                Player preview coming soon
              </div>
            )}
          </div>
        </div>
        <aside className="flex flex-[1] min-w-[220px] flex-col border-l border-white/60 bg-white/60 dark:border-slate-800/60 dark:bg-slate-950/60">
          <nav className="flex items-center gap-2 border-b border-white/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-600 dark:border-slate-800/60 dark:text-slate-300">
            {TAB_LABELS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-full border px-3 py-1 transition ${
                  activeTab === tab.id
                    ? 'border-amber-400/80 bg-amber-200/60 text-slate-900 shadow-inner dark:border-amber-400/60 dark:bg-amber-400/20 dark:text-amber-100'
                    : 'border-transparent bg-transparent text-slate-500 hover:border-amber-400/60 hover:text-amber-600 dark:text-slate-400 dark:hover:border-amber-400/50 dark:hover:text-amber-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] uppercase tracking-[0.4em] text-slate-400 dark:text-slate-500">
            {activeTab === 'rooms' && 'Room details coming soon'}
            {activeTab === 'markers' && 'Marker controls coming soon'}
            {activeTab === 'other' && 'Additional tools coming soon'}
          </div>
        </aside>
      </div>
    </section>
  );
};

export default DMSessionViewer;
