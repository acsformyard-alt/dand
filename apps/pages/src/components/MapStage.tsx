import React, { useEffect, useMemo, useState } from "react";
import MaskCanvas from "./MaskCanvas";
import MarkerLayer from "./MarkerLayer";

type MapStageProps = {
  map: { displayKey?: string | null; width?: number | null; height?: number | null } | null;
  regions: any[];
  revealedRegionIds: string[];
  markers: Record<string, any>;
  onMarkerSelect?: (markerId: string) => void;
  selectedMarkerId?: string | null;
  r2PublicBase?: string | null;
};

const fallbackSize = { width: 1280, height: 720 };

const MapStage: React.FC<MapStageProps> = ({ map, regions, revealedRegionIds, markers, onMarkerSelect, selectedMarkerId, r2PublicBase }) => {
  const [dimensions, setDimensions] = useState({ width: fallbackSize.width, height: fallbackSize.height });
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!map?.displayKey) {
      setImageUrl(null);
      return;
    }
    if (map.displayKey.startsWith("http")) {
      setImageUrl(map.displayKey);
      return;
    }
    if (r2PublicBase) {
      const url = new URL(map.displayKey, r2PublicBase);
      setImageUrl(url.toString());
    } else {
      setImageUrl(map.displayKey);
    }
  }, [map?.displayKey, r2PublicBase]);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      setDimensions({ width: img.naturalWidth || fallbackSize.width, height: img.naturalHeight || fallbackSize.height });
    };
  }, [imageUrl]);

  const revealedPolygons = useMemo(() => {
    return regions
      .filter((region) => revealedRegionIds.includes(region.id))
      .map((region) => region.polygon ?? []);
  }, [regions, revealedRegionIds]);

  return (
    <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-800/80">
      {imageUrl ? (
        <div
          className="relative"
          style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
        >
          <img src={imageUrl} alt={map?.name ?? "Map"} className="block h-full w-full select-none object-contain" />
          <MaskCanvas width={dimensions.width} height={dimensions.height} revealedPolygons={revealedPolygons} />
          <div className="absolute inset-0">
            <MarkerLayer markers={markers} onSelect={onMarkerSelect} selectedMarkerId={selectedMarkerId} />
          </div>
        </div>
      ) : (
        <div className="flex h-96 w-full flex-col items-center justify-center gap-3 text-slate-100">
          <span className="text-lg font-semibold">No map selected</span>
          <span className="text-sm text-slate-300">Choose a campaign map to preview the fog-of-war.</span>
        </div>
      )}
    </div>
  );
};

export default MapStage;
