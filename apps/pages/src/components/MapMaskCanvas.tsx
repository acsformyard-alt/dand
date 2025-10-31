import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Marker, Region } from '../types';
import { roomMaskToPolygon } from '../utils/roomMask';
import { getMapMarkerIconDefinition } from './mapMarkerIcons';

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

const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const normaliseMarkers = (markers?: Record<string, Marker> | Marker[]) => {
  if (!markers) return [] as Marker[];
  if (Array.isArray(markers)) return markers;
  return Object.values(markers);
};

const DEFAULT_MARKER_COLOR = '#facc15';

const colorWithAlpha = (color: string | null | undefined, alpha: number) => {
  const fallback = DEFAULT_MARKER_COLOR;
  const source = (color ?? '').trim() || fallback;

  if (source.startsWith('#')) {
    let hex = source.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((char) => char + char)
        .join('');
    }
    if (hex.length === 8) {
      hex = hex.slice(0, 6);
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }

  const rgbMatch = source.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (source !== fallback) {
    return colorWithAlpha(fallback, alpha);
  }

  return `rgba(250, 204, 21, ${alpha})`;
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
  const regionPolygons = useMemo(
    () =>
      regions.map((region) => ({
        region,
        polygon: roomMaskToPolygon(region.mask),
      })),
    [regions]
  );
  const polygonById = useMemo(() => {
    const map = new Map<string, Array<{ x: number; y: number }>>();
    for (const entry of regionPolygons) {
      map.set(entry.region.id, entry.polygon);
    }
    return map;
  }, [regionPolygons]);

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
    revealedRegionIds.forEach((regionId) => {
      const polygon = polygonById.get(regionId);
      if (!polygon || polygon.length === 0) return;
      context.beginPath();
      polygon.forEach((point, index) => {
        const x = point.x * maskWidth;
        const y = point.y * maskHeight;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
      context.closePath();
      context.fill();
    });
    context.globalCompositeOperation = 'source-over';
    if (hoverRegion && mode === 'dm') {
      const polygon = polygonById.get(hoverRegion);
      if (polygon && polygon.length) {
        context.beginPath();
        context.fillStyle = 'rgba(251, 191, 36, 0.2)';
        polygon.forEach((point, index) => {
          const x = point.x * maskWidth;
          const y = point.y * maskHeight;
          if (index === 0) {
            context.moveTo(x, y);
          } else {
            context.lineTo(x, y);
          }
        });
        context.closePath();
        context.fill();
      }
    }
  }, [polygonById, revealedRegionIds, imageSize, hoverRegion, mode, width, height]);

  const handlePointer = (event: React.MouseEvent) => {
    if (!imageSize) return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const region = regionPolygons.find((candidate) => pointInPolygon({ x, y }, candidate.polygon))?.region;
    setHoverRegion(region?.id ?? null);
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!imageSize) return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const region = regionPolygons.find((candidate) => pointInPolygon({ x, y }, candidate.polygon))?.region;
    if (region && onToggleRegion && mode === 'dm') {
      const nextState = !revealedRegionIds.includes(region.id);
      onToggleRegion(region.id, nextState);
    } else if (!region && onPlaceMarker && mode === 'dm') {
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
        const accentColor = (marker.color || iconDefinition?.defaultColor || DEFAULT_MARKER_COLOR).trim() || DEFAULT_MARKER_COLOR;
        const markerBackgroundColor = colorWithAlpha(accentColor, 0.25);
        const markerBorderColor = colorWithAlpha(accentColor, 0.45);
        return (
          <button
            key={marker.id}
            type="button"
            onClick={() => onSelectMarker?.(marker.id)}
            className="absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold uppercase tracking-[0.3em] shadow-sm backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 dark:focus-visible:ring-slate-200"
            style={{
              left: `${(marker.x ?? 0) * 100}%`,
              top: `${(marker.y ?? 0) * 100}%`,
              backgroundColor: markerBackgroundColor,
              borderColor: markerBorderColor,
              color: accentColor,
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            {iconDefinition && (
              <span className="flex h-4 w-4 items-center justify-center" style={{ color: accentColor }}>
                {iconDefinition.icon}
              </span>
            )}
            <span className="whitespace-nowrap">{marker.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default MapMaskCanvas;
