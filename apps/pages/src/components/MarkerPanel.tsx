import React from 'react';
import type { Marker } from '../types';

interface MarkerPanelProps {
  markers: Marker[];
  onRemove?: (markerId: string) => void;
  onUpdate?: (marker: Marker) => void;
}

const MarkerPanel: React.FC<MarkerPanelProps> = ({ markers, onRemove, onUpdate }) => {
  return (
    <div className="space-y-3">
      {markers.map((marker) => (
        <div
          key={marker.id}
          className="rounded-2xl border border-white/60 bg-white/75 px-3 py-3 text-sm shadow-sm shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: marker.color || '#facc15' }}
              />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{marker.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ({Math.round((marker.x ?? 0) * 100)}%, {Math.round((marker.y ?? 0) * 100)}%)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-amber-400/70 bg-amber-200/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-amber-200/80 dark:border-amber-400/40 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
                onClick={() => onUpdate?.(marker)}
              >
                Edit
              </button>
              <button
                className="rounded-full border border-rose-400/70 bg-rose-200/70 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-rose-700 transition hover:bg-rose-200/80 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                onClick={() => onRemove?.(marker.id)}
              >
                Remove
              </button>
            </div>
          </div>
          {marker.description && <p className="mt-2 text-xs opacity-75">{marker.description}</p>}
        </div>
      ))}
      {markers.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">No markers placed.</p>}
    </div>
  );
};

export default MarkerPanel;
