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
          className="rounded-xl border border-white/70 bg-white/60 px-3 py-2 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-950/70"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: marker.color || '#facc15' }}
              />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{marker.label}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  ({Math.round((marker.x ?? 0) * 100)}%, {Math.round((marker.y ?? 0) * 100)}%)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-amber-400/70 bg-amber-200/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-amber-200/80 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
                onClick={() => onUpdate?.(marker)}
              >
                Edit
              </button>
              <button
                className="rounded-full bg-rose-500 px-2 py-1 text-xs text-white hover:bg-rose-600"
                onClick={() => onRemove?.(marker.id)}
              >
                Remove
              </button>
            </div>
          </div>
          {marker.description && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{marker.description}</p>}
        </div>
      ))}
      {markers.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">No markers placed.</p>}
    </div>
  );
};

export default MarkerPanel;
