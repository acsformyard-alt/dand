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
          className="rounded-2xl border border-white/60 bg-white/70 px-3 py-2 text-sm shadow-sm shadow-amber-500/10 backdrop-blur-sm dark:border-slate-800/70 dark:bg-slate-950/70"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: marker.color || '#facc15' }}
              />
              <div>
                <p className="font-medium">{marker.label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ({Math.round((marker.x ?? 0) * 100)}%, {Math.round((marker.y ?? 0) * 100)}%)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="rounded-full border border-amber-400/60 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-700 transition hover:bg-amber-100/80 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-400/20"
                onClick={() => onUpdate?.(marker)}
              >
                Edit
              </button>
              <button
                className="rounded-full border border-rose-400/60 bg-rose-500/90 px-2 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-rose-500"
                onClick={() => onRemove?.(marker.id)}
              >
                Remove
              </button>
          </div>
          </div>
          {marker.description && <p className="mt-2 text-xs opacity-75">{marker.description}</p>}
        </div>
      ))}
      {markers.length === 0 && <p className="text-sm text-slate-500">No markers placed.</p>}
    </div>
  );
};

export default MarkerPanel;
