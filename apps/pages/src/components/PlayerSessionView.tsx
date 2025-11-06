import React, { useMemo } from 'react';
import type { MapRecord, Marker, Region, SessionRecord } from '../types';
import PlayerView from './PlayerView';

interface PlayerSessionViewProps {
  session: SessionRecord;
  campaignName?: string | null;
  map?: MapRecord | null;
  mapName?: string | null;
  mapImageUrl?: string | null;
  mapWidth?: number | null;
  mapHeight?: number | null;
  regions: Region[];
  revealedRegionIds?: string[] | null;
  markers?: Record<string, Marker> | Marker[];
  sessionMarkers?: Record<string, Marker> | Marker[];
  onLeave?: () => void;
}

const PlayerSessionView: React.FC<PlayerSessionViewProps> = ({
  session,
  campaignName,
  map,
  mapName,
  mapImageUrl,
  mapWidth,
  mapHeight,
  regions,
  revealedRegionIds,
  markers,
  sessionMarkers,
  onLeave,
}) => {
  const playerRevealedRegionIds = useMemo(
    () =>
      revealedRegionIds && revealedRegionIds.length > 0
        ? revealedRegionIds
        : regions.filter((region) => region.visibleAtStart).map((region) => region.id),
    [regions, revealedRegionIds],
  );

  const resolvedCampaignName = campaignName ?? session.campaignName ?? 'Unknown Campaign';
  const resolvedMapName = mapName ?? session.mapName ?? map?.name ?? 'Unknown Map';

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/50 bg-white/60 shadow-xl shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
      <header className="flex flex-wrap items-center justify-between gap-4 overflow-hidden border-b border-white/40 bg-white/50 px-5 py-3 text-[11px] uppercase tracking-[0.35em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">
              Campaign
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900 dark:text-white">
              {resolvedCampaignName}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">
              Map
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900 dark:text-white">
              {resolvedMapName}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-[0.45em] text-slate-500 dark:text-slate-400">
              Session
            </span>
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-900 dark:text-white">
              {session.name}
            </span>
          </div>
        </div>
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="rounded-full border border-rose-400/70 bg-rose-200/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-rose-700 transition hover:bg-rose-200/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
          >
            Leave Session
          </button>
        )}
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-950/70 p-3 sm:p-4">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-white/20 bg-slate-900/80 shadow-inner shadow-black/30 dark:border-slate-800/70">
          <PlayerView
            mapImageUrl={mapImageUrl ?? undefined}
            width={mapWidth ?? map?.width ?? undefined}
            height={mapHeight ?? map?.height ?? undefined}
            regions={regions}
            revealedRegionIds={playerRevealedRegionIds}
            markers={markers}
            sessionMarkers={sessionMarkers}
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerSessionView;

