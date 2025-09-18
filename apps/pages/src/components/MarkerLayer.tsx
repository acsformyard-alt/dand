import React from "react";
import clsx from "clsx";

export type MarkerLayerProps = {
  markers: Record<string, any>;
  onSelect?: (markerId: string) => void;
  selectedMarkerId?: string | null;
};

const markerColors: Record<string, string> = {
  enemy: "bg-red-500",
  ally: "bg-emerald-500",
  note: "bg-sky-500",
  trap: "bg-amber-500"
};

const MarkerLayer: React.FC<MarkerLayerProps> = ({ markers, onSelect, selectedMarkerId }) => {
  return (
    <>
      {Object.values(markers).map((marker: any) => {
        const color = markerColors[marker.markerType] ?? "bg-slate-500";
        return (
          <button
            key={marker.id}
            onClick={() => onSelect?.(marker.id)}
            className={clsx(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 px-2 py-1 text-xs font-semibold text-white shadow-lg focus:outline-none focus:ring",
              color,
              selectedMarkerId === marker.id ? "ring-2 ring-white" : "ring-0"
            )}
            style={{ left: `${marker.position?.x ?? 0}px`, top: `${marker.position?.y ?? 0}px` }}
          >
            {marker.name ?? marker.markerType}
          </button>
        );
      })}
    </>
  );
};

export default MarkerLayer;
