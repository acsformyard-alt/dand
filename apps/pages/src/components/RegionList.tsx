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
            className={`flex items-start justify-between rounded-lg border px-3 py-2 text-sm shadow-sm transition hover:border-amber-400/70 hover:shadow ${
              revealed
                ? 'border-amber-400/70 bg-amber-100/40 text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-100'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <div>
              <button
                className="font-medium hover:underline"
                onClick={() => onSelectRegion?.(region)}
              >
                {region.name}
              </button>
              {region.notes && <p className="mt-1 text-xs opacity-75">{region.notes}</p>}
            </div>
            <button
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                revealed
                  ? 'bg-amber-500 text-slate-900 hover:bg-amber-400'
                  : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white hover:shadow-lg hover:shadow-amber-500/30'
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
