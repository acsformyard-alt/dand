import React from 'react';
import type { Region } from '../types';

interface RegionListProps {
  regions: Region[];
  revealedRegionIds: string[];
  onToggleRegion?: (region: Region, nextState: boolean) => void;
  onSelectRegion?: (region: Region) => void;
}

const RegionList: React.FC<RegionListProps> = ({ regions, revealedRegionIds, onToggleRegion, onSelectRegion }) => {
  return (
    <div className="space-y-3">
      {regions.map((region) => {
        const revealed = revealedRegionIds.includes(region.id);
        return (
          <div
            key={region.id}
            className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm shadow transition ${
              revealed
                ? 'border-amber-300/80 bg-amber-100/70 text-slate-900 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-100'
                : 'border-white/60 bg-white/70 text-slate-900 hover:border-amber-400/70 hover:shadow-lg dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:border-amber-400/50'
            }`}
          >
            <div>
              <button
                className="font-semibold text-slate-900 hover:underline dark:text-white"
                onClick={() => onSelectRegion?.(region)}
              >
                {region.name}
              </button>
              {region.notes && <p className="mt-1 text-xs opacity-75">{region.notes}</p>}
            </div>
            <button
              className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                revealed
                  ? 'border border-rose-400/70 bg-rose-200/70 text-rose-700 hover:bg-rose-200/80 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30'
                  : 'border border-amber-400/70 bg-amber-300/80 text-slate-900 hover:bg-amber-300/90 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30'
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
