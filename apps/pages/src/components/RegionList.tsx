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
            className={`group relative overflow-hidden rounded-2xl border px-4 py-3 text-sm backdrop-blur transition shadow-lg ${
              revealed
                ? 'border-emerald-400/70 bg-emerald-200/40 text-emerald-800 shadow-emerald-500/20 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100'
                : 'border-white/60 bg-white/60 text-slate-700 shadow-amber-500/5 hover:border-amber-400/60 hover:shadow-amber-500/20 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:border-amber-400/50'
            }`}
          >
            <div className="pr-4">
              <button
                className="font-semibold text-slate-900 hover:text-amber-600 hover:underline dark:text-white dark:hover:text-amber-200"
                onClick={() => onSelectRegion?.(region)}
              >
                {region.name}
              </button>
              {region.notes && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{region.notes}</p>
              )}
            </div>
            <button
              className={`inline-flex items-center rounded-full border px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] transition ${
                revealed
                  ? 'border-emerald-500/70 bg-emerald-400/60 text-emerald-900 hover:bg-emerald-400/80 dark:border-emerald-400/60 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/20'
                  : 'border-amber-400/60 bg-amber-300/70 text-slate-900 hover:bg-amber-300/90 dark:border-amber-400/50 dark:bg-amber-400/15 dark:text-amber-100 dark:hover:bg-amber-400/25'
              }`}
              onClick={() => onToggleRegion?.(region, !revealed)}
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-200/20 to-transparent opacity-0 transition duration-300 ${
                revealed ? 'group-hover:opacity-0' : 'group-hover:opacity-100'
              } dark:from-amber-400/10`}
            />
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
