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
          className="rounded-xl border border-amber-200/70 bg-white/80 px-3 py-2 text-sm shadow-sm shadow-amber-500/10 transition-colors dark:border-amber-500/30 dark:bg-slate-950/60"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: marker.color || '#facc15' }}
              />
              <div>
                <p className="font-medium">{marker.label}</p>
                <p className="text-xs text-slate-500 dark:text-amber-200/70">
                  ({Math.round((marker.x ?? 0) * 100)}%, {Math.round((marker.y ?? 0) * 100)}%)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-amber-300/70 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 transition hover:bg-amber-50/70 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/10"
                onClick={() => onUpdate?.(marker)}
              >
                Edit
              </button>
              <button
                className="rounded-full bg-rose-500 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-rose-600"
                onClick={() => onRemove?.(marker.id)}
              >
                Remove
              </button>
            </div>
          </div>
          {marker.description && <p className="mt-2 text-xs opacity-75">{marker.description}</p>}
        </div>
      ))}
      {markers.length === 0 && <p className="text-sm text-amber-600 dark:text-amber-200/70">No markers placed.</p>}
    </div>
  );
};

export default MarkerPanel;
