import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Marker, Region } from '../types';
import { isPointInRoomMask, roomMaskHasCoverage } from '../utils/roomMask';
import {
  getReadableTextColor,
  normalizeHexColor,
  normaliseMarkers,
  resolveMarkerBaseColor,
  rgbaFromNormalizedHex,
} from '../utils/markerUtils';
import { getMapMarkerIconDefinition, type MapMarkerIconDefinition } from './mapMarkerIcons';

interface MapMaskCanvasProps {
  imageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  regions: Region[];
  revealedRegionIds: string[];
  markers?: Record<string, Marker> | Marker[];
  mode: 'dm' | 'player';
  onToggleRegion?: (regionId: string, nextState: boolean) => void;
  onPlaceMarker?: (coords: { x: number; y: number }) => void;
  onSelectMarker?: (markerId: string) => void;
}

const createMaskCanvas = (mask: Region['mask']): HTMLCanvasElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  const offscreen = document.createElement('canvas');
  offscreen.width = mask.width;
  offscreen.height = mask.height;
  const context = offscreen.getContext('2d');
  if (!context) {
    return null;
  }
  const imageData = context.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i += 1) {
    const alpha = mask.data[i];
    const offset = i * 4;
    imageData.data[offset] = 0;
    imageData.data[offset + 1] = 0;
    imageData.data[offset + 2] = 0;
    imageData.data[offset + 3] = alpha;
  }
  context.putImageData(imageData, 0, 0);
  return offscreen;
};

type RegionRenderEntry = {
  region: Region;
  hasCoverage: boolean;
  maskCanvas: HTMLCanvasElement | null;
};

const MapMaskCanvas: React.FC<MapMaskCanvasProps> = ({
  imageUrl,
  width,
  height,
  regions,
  revealedRegionIds,
  markers,
  mode,
  onToggleRegion,
  onPlaceMarker,
  onSelectMarker,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [hoverRegion, setHoverRegion] = useState<string | null>(null);
  const resolvedMarkers = useMemo(() => normaliseMarkers(markers), [markers]);
  const regionEntries = useMemo<RegionRenderEntry[]>(
    () =>
      regions.map((region) => {
        const hasCoverage = roomMaskHasCoverage(region.mask);
        const maskCanvas = hasCoverage ? createMaskCanvas(region.mask) : null;
        return { region, hasCoverage, maskCanvas };
      }),
    [regions],
  );
  const regionById = useMemo(() => {
    const map = new Map<string, RegionRenderEntry>();
    for (const entry of regionEntries) {
      map.set(entry.region.id, entry);
    }
    return map;
  }, [regionEntries]);
  const activeRegions = useMemo(() => regionEntries.filter((entry) => entry.hasCoverage), [regionEntries]);

  useEffect(() => {
    if (!imageUrl) {
      setImageSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const maskWidth = imageSize?.width || width || 1024;
    const maskHeight = imageSize?.height || height || 768;
    canvas.width = maskWidth;
    canvas.height = maskHeight;
    context.clearRect(0, 0, maskWidth, maskHeight);
    context.fillStyle = 'rgba(15, 23, 42, 0.8)';
    context.fillRect(0, 0, maskWidth, maskHeight);
    context.globalCompositeOperation = 'destination-out';
    for (const regionId of revealedRegionIds) {
      const entry = regionById.get(regionId);
      if (!entry?.maskCanvas) {
        continue;
      }
      const { bounds } = entry.region.mask;
      const destX = bounds.minX * maskWidth;
      const destY = bounds.minY * maskHeight;
      const destWidth = Math.max(1, (bounds.maxX - bounds.minX) * maskWidth);
      const destHeight = Math.max(1, (bounds.maxY - bounds.minY) * maskHeight);
      context.drawImage(entry.maskCanvas, destX, destY, destWidth, destHeight);
    }
    context.globalCompositeOperation = 'source-over';
    if (hoverRegion && mode === 'dm') {
      const entry = regionById.get(hoverRegion);
      if (entry?.maskCanvas) {
        const { bounds } = entry.region.mask;
        const destX = bounds.minX * maskWidth;
        const destY = bounds.minY * maskHeight;
        const destWidth = Math.max(1, (bounds.maxX - bounds.minX) * maskWidth);
        const destHeight = Math.max(1, (bounds.maxY - bounds.minY) * maskHeight);
        context.save();
        context.fillStyle = 'rgba(251, 191, 36, 0.2)';
        context.fillRect(destX, destY, destWidth, destHeight);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(entry.maskCanvas, destX, destY, destWidth, destHeight);
        context.restore();
      }
    }
  }, [regionById, revealedRegionIds, imageSize, hoverRegion, mode, width, height]);

  const handlePointer = (event: React.MouseEvent) => {
    if (!imageSize) return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const regionEntry = activeRegions.find((entry) => isPointInRoomMask(entry.region.mask, { x, y }));
    setHoverRegion(regionEntry?.region.id ?? null);
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!imageSize) return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const regionEntry = activeRegions.find((entry) => isPointInRoomMask(entry.region.mask, { x, y }));
    if (regionEntry && onToggleRegion && mode === 'dm') {
      const nextState = !revealedRegionIds.includes(regionEntry.region.id);
      onToggleRegion(regionEntry.region.id, nextState);
    } else if (!regionEntry && onPlaceMarker && mode === 'dm') {
      onPlaceMarker({ x, y });
    }
  };

  const displayWidth = imageSize?.width || width || 1024;
  const displayHeight = imageSize?.height || height || 768;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/70 bg-white/60 shadow-inner dark:border-slate-800/70 dark:bg-slate-950/60">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Game map"
          className="block w-full select-none"
          style={{ maxHeight: '70vh', objectFit: 'contain' }}
        />
      ) : (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Upload a map to begin
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={displayWidth}
        height={displayHeight}
        className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2"
        style={{ pointerEvents: mode === 'dm' ? 'auto' : 'none' }}
        onMouseMove={mode === 'dm' ? handlePointer : undefined}
        onMouseLeave={() => setHoverRegion(null)}
        onClick={handleClick}
      />
      {resolvedMarkers.map((marker) => {
        const iconDefinition = getMapMarkerIconDefinition(marker.iconKey);
        const baseColor = resolveMarkerBaseColor(marker, iconDefinition);
        const backgroundColor = rgbaFromNormalizedHex(baseColor, 0.55);
        const borderColor = rgbaFromNormalizedHex(baseColor, 0.7);
        const textColor = getReadableTextColor(baseColor);
        return (
          <button
            key={marker.id}
            onClick={() => onSelectMarker?.(marker.id)}
            className="absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.3em] shadow transition hover:brightness-105"
            style={{
              left: `${(marker.x ?? 0) * 100}%`,
              top: `${(marker.y ?? 0) * 100}%`,
              backgroundColor,
              borderColor,
              color: textColor,
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: baseColor }}
            />
            {iconDefinition && (
              <span className="flex h-4 w-4 items-center justify-center">
                {iconDefinition.icon}
              </span>
            )}
            {marker.label}
          </button>
        );
      })}
    </div>
  );
};

export default MapMaskCanvas;
