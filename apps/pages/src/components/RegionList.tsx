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
            className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg shadow-amber-500/5 transition transform hover:-translate-y-0.5 hover:shadow-amber-500/20 ${
              revealed
                ? 'border-amber-400/70 bg-amber-100/40 text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-100'
                : 'border-white/60 bg-white/70 text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200'
            }`}
          >
            <div>
              <button
                className="font-semibold text-slate-900 underline-offset-4 hover:text-amber-600 hover:underline dark:text-white dark:hover:text-amber-200"
                onClick={() => onSelectRegion?.(region)}
              >
                {region.name}
              </button>
              {region.notes && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{region.notes}</p>}
            </div>
            <button
              className={`rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.35em] transition ${
                revealed
                  ? 'border border-amber-500/70 bg-amber-300/80 text-slate-900 hover:bg-amber-300/90 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30'
                  : 'border border-slate-300/70 bg-white/70 text-slate-700 hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-amber-400/70 dark:hover:text-amber-200'
              }`}
              onClick={() => onToggleRegion?.(region, !revealed)}
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>
        );
      })}
      {regions.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300/70 px-4 py-6 text-center text-xs text-slate-500 dark:border-slate-700/70 dark:text-slate-400">
          No regions defined yet.
        </p>
      )}
    </div>
  );
};

export default RegionList;
