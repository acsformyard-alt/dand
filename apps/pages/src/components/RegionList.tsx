import React from 'react';
import type { Region } from '../types';

const resolveRegionColor = (value?: string | null) => {
  if (!value) {
    return '#facc15';
  }
  const trimmed = value.trim();
  return (trimmed ? trimmed.toLowerCase() : '') || '#facc15';
};

interface RegionListProps {
  regions: Region[];
  revealedRegionIds: string[];
  onToggleRegion?: (region: Region, nextState: boolean) => void;
  onSelectRegion?: (region: Region) => void;
}

const RegionList: React.FC<RegionListProps> = ({ regions, revealedRegionIds, onToggleRegion, onSelectRegion }) => {
  return (
    <div className="space-y-2">
      {regions.map((region) => {
        const revealed = revealedRegionIds.includes(region.id);
        return (
          <div
            key={region.id}
            className={`flex items-start justify-between rounded-xl border px-3 py-2 text-sm shadow-sm transition ${
              revealed
                ? 'border-amber-400/70 bg-amber-200/20 text-amber-900 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-100'
                : 'border-white/70 bg-white/60 dark:border-slate-800 dark:bg-slate-950/70'
            }`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="block h-3 w-3 rounded-full border border-white/40 shadow-sm"
                  style={{ backgroundColor: resolveRegionColor(region.color) }}
                  aria-hidden="true"
                />
                <button
                  className="font-semibold text-slate-900 underline-offset-4 transition hover:text-amber-600 hover:underline dark:text-white dark:hover:text-amber-200"
                  onClick={() => onSelectRegion?.(region)}
                >
                  {region.name}
                </button>
              </div>
              {region.notes && <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{region.notes}</p>}
            </div>
            <button
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${
                revealed
                  ? 'border border-amber-500/70 bg-amber-500/20 text-amber-900 hover:bg-amber-500/30 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100'
                  : 'border border-amber-400/70 bg-amber-300/80 text-slate-900 hover:bg-amber-300/90 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100'
              }`}
              onClick={() => onToggleRegion?.(region, !revealed)}
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>
        );
      })}
      {regions.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400">No regions defined yet.</p>
      )}
    </div>
  );
};

export default RegionList;
