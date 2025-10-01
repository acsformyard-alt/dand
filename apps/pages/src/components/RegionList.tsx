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
            className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm shadow-lg shadow-amber-500/10 transition hover:border-amber-400/70 hover:shadow-amber-500/20 backdrop-blur-sm ${
              revealed
                ? 'border-emerald-300/70 bg-emerald-200/40 text-emerald-900 dark:border-emerald-400/50 dark:bg-emerald-400/15 dark:text-emerald-100'
                : 'border-white/60 bg-white/70 text-slate-700 dark:border-slate-800/70 dark:bg-slate-950/70 dark:text-slate-100'
            }`}
          >
            <div>
              <button
                className="text-sm font-semibold text-slate-900 underline-offset-4 hover:text-amber-600 hover:underline dark:text-white dark:hover:text-amber-200"
                onClick={() => onSelectRegion?.(region)}
              >
                {region.name}
              </button>
              {region.notes && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{region.notes}</p>}
            </div>
            <button
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                revealed
                  ? 'border border-emerald-400/70 bg-emerald-300/60 text-emerald-900 hover:bg-emerald-300/80 focus-visible:outline-emerald-400 dark:border-emerald-400/50 dark:bg-emerald-400/15 dark:text-emerald-100 dark:hover:bg-emerald-400/25'
                  : 'border border-amber-400/70 bg-amber-300/80 text-slate-900 hover:bg-amber-300/90 focus-visible:outline-amber-400 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-100 dark:hover:bg-amber-400/25'
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
