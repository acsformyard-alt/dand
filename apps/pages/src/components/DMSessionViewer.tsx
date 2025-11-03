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
}

const tabs: Array<{ id: 'rooms' | 'markers' | 'other'; label: string }> = [
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
}) => {
  const [viewMode, setViewMode] = useState<'dm' | 'player'>('dm');
  const [activeTab, setActiveTab] = useState<'rooms' | 'markers' | 'other'>('rooms');

  const revealedRegionIds = useMemo(() => regions.map((region) => region.id), [regions]);

  const handleToggleViewMode = () => {
    setViewMode((prev) => (prev === 'dm' ? 'player' : 'dm'));
  };

  return (
    <div className="flex h-[75vh] min-h-[560px] flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/70 shadow-2xl shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
      <header className="flex items-center justify-between border-b border-white/50 bg-white/60 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-slate-600 dark:border-slate-800/60 dark:bg-slate-950/60 dark:text-slate-300">
        <div className="flex flex-col gap-1 text-[10px] tracking-[0.35em] text-slate-600 dark:text-slate-300">
          <span className="text-[11px] font-semibold tracking-[0.45em] text-slate-800 dark:text-slate-100">{session.name}</span>
          <span className="text-[9px] uppercase tracking-[0.5em] text-slate-400 dark:text-slate-500">Dungeon Master View</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveSnapshot}
            className="rounded-full border border-amber-400/60 bg-amber-200/70 px-4 py-1 text-[10px] font-semibold tracking-[0.35em] text-amber-900 transition hover:bg-amber-200/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
            disabled={!onSaveSnapshot}
          >
            Save Snapshot
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-400/50 bg-slate-200/50 px-4 py-1 text-[10px] font-semibold tracking-[0.35em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:border-amber-400/70 dark:hover:text-amber-200"
          >
            View Players
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="rounded-full border border-rose-500/80 bg-rose-100/70 px-4 py-1 text-[10px] font-semibold tracking-[0.35em] text-rose-600 transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500 dark:border-rose-500/60 dark:bg-rose-500/15 dark:text-rose-100 dark:hover:bg-rose-500/25"
            disabled={!onEndSession}
          >
            End Session
          </button>
        </div>
      </header>
      <div className="flex flex-1">
        <div className="relative flex flex-[4] items-center justify-center bg-slate-900/40 dark:bg-slate-950/60">
          <div className="absolute left-4 top-4 z-20">
            <button
              type="button"
              onClick={handleToggleViewMode}
              className="rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-800 shadow-lg shadow-amber-500/20 transition hover:border-amber-400/80 hover:text-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
            >
              {viewMode === 'dm' ? 'DM View' : 'Player Preview'}
            </button>
          </div>
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <MapMaskCanvas
              imageUrl={mapImageUrl}
              width={mapWidth}
              height={mapHeight}
              regions={regions}
              revealedRegionIds={revealedRegionIds}
              markers={markers}
              mode={viewMode}
            />
          </div>
        </div>
        <aside className="flex flex-[1] flex-col border-l border-white/50 bg-white/50 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/40">
          <nav className="flex items-stretch">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 border-b-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.4em] transition ${
                    isActive
                      ? 'border-amber-400 text-slate-900 dark:text-amber-200'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div className="flex-1" />
        </aside>
      </div>
    </div>
  );
};

export default DMSessionViewer;
