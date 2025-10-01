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
    <div className="space-y-2">
      {regions.map((region) => {
        const revealed = revealedRegionIds.includes(region.id);
        return (
          <div
            key={region.id}
            className={`flex items-start justify-between rounded-xl border px-3 py-2 text-sm shadow-sm shadow-amber-500/10 transition hover:border-primary/60 hover:shadow-lg ${
              revealed
                ? 'border-amber-400/70 bg-amber-100/20 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100'
                : 'border-amber-200/40 bg-white/80 dark:border-amber-500/20 dark:bg-slate-950/60'
            }`}
          >
            <div>
              <button
                className="font-semibold text-slate-800 hover:text-amber-700 hover:underline dark:text-amber-50 dark:hover:text-amber-200"
                onClick={() => onSelectRegion?.(region)}
              >
                {region.name}
              </button>
              {region.notes && <p className="mt-1 text-xs opacity-75">{region.notes}</p>}
            </div>
            <button
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                revealed
                  ? 'bg-rose-500 text-white hover:bg-rose-600'
                  : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow shadow-amber-500/20 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400'
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
