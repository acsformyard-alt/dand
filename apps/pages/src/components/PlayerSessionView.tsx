import React, { useMemo } from 'react';
import type { MapRecord, Region, SessionRecord } from '../types';
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
  onLeave,
}) => {
  // Fall back to regions visible at start if no revealed list was supplied
  const playerRevealedRegionIds = useMemo(
    () =>
      revealedRegionIds && revealedRegionIds.length > 0
        ? revealedRegionIds
        : regions.filter((r) => r.visibleAtStart).map((r) => r.id),
    [regions, revealedRegionIds],
  );

  const resolvedCampaignName = (campaignName ?? session.campaignName) || undefined;
  const resolvedMapName = (mapName ?? map?.name) || undefined;

  return (
    // VIEWPORT-LOCKED ROOT: two-row grid -> header (auto) + content (1fr)
    <div className="grid h-[100svh] min-h-[100svh] max-h-[100svh] w-full flex-1 grid-rows-[auto,1fr] overflow-hidden rounded-2xl border border-white/50 bg-white/60 shadow-xl shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
      {/* HEADER: non-flexing */}
      <header className="flex flex-none flex-wrap items-center justify-between gap-4 overflow-hidden border-b border-white/40 bg-white/50 px-5 py-3 text-[11px] uppercase tracking-[0.35em] text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <div className="flex min-w-0 items-center gap-3">
          {resolvedCampaignName && (
            <span className="truncate opacity-80">{resolvedCampaignName}</span>
          )}
          <span className="opacity-40">{'—'}</span>
          <span className="truncate font-medium text-slate-800 dark:text-slate-100">
            {session?.name}
          </span>
          {resolvedMapName && (
            <>
              <span className="opacity-40">{'/'}</span>
              <span className="truncate opacity-80">{resolvedMapName}</span>
            </>
          )}
        </div>
        {onLeave && (
          <button
            onClick={onLeave}
            className="rounded-md border border-white/40 bg-white/80 px-3 py-1 text-[10px] font-semibold tracking-widest text-slate-700 shadow-sm backdrop-blur hover:bg-white dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
          >
            LEAVE SESSION
          </button>
        )}
      </header>

      {/* CONTENT WRAPPER: center content; no vertical overflow */}
      <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-slate-950/70 p-3 sm:p-4">
        {/* LETTERBOXED FRAME: respects map aspect ratio if provided */}
        <div
          className="relative max-h-full max-w-full overflow-hidden rounded-xl border border-white/20 bg-slate-900/80 shadow-inner shadow-black/30 dark:border-slate-800/70"
          style={{
            aspectRatio:
              mapWidth && mapHeight ? `${mapWidth} / ${mapHeight}` : undefined,
          }}
        >
          <PlayerView
            mapImageUrl={mapImageUrl ?? undefined}
            width={mapWidth ?? map?.width ?? undefined}
            height={mapHeight ?? map?.height ?? undefined}
            regions={regions}
            revealedRegionIds={playerRevealedRegionIds}
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerSessionView;
