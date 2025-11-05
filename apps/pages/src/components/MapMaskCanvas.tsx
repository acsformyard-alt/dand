import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Marker, Region } from '../types';
import { encodeRoomMaskToDataUrl, roomMaskContainsPoint } from '../utils/roomMask';
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

const normaliseMarkers = (markers?: Record<string, Marker> | Marker[]) => {
  if (!markers) return [] as Marker[];
  if (Array.isArray(markers)) return markers;
  return Object.values(markers);
};

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHexColor = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const match = HEX_COLOR_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }
  const hex = match[1];
  if (hex.length === 3) {
    const [r, g, b] = hex.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return `#${hex.toLowerCase()}`;
};

const rgbFromNormalizedHex = (hex: string) => {
  const value = hex.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

const rgbaFromNormalizedHex = (hex: string, alpha: number) => {
  const { r, g, b } = rgbFromNormalizedHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getReadableTextColor = (hex: string) => {
  const { r, g, b } = rgbFromNormalizedHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0f172a' : '#f8fafc';
};

const resolveMarkerBaseColor = (
  marker: Marker,
  definition?: MapMarkerIconDefinition,
): string => {
  const candidates: Array<string | null | undefined> = [
    marker.color,
    definition?.defaultColor,
    '#facc15',
  ];
  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '#facc15';
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
  const [maskImages, setMaskImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const resolvedMarkers = useMemo(() => normaliseMarkers(markers), [markers]);
  const regionById = useMemo(() => {
    const map = new Map<string, Region>();
    for (const region of regions) {
      map.set(region.id, region);
    }
    return map;
  }, [regions]);

  useEffect(() => {
    let cancelled = false;
    const loadImages = async () => {
      const entries: Array<[string, HTMLImageElement]> = [];
      await Promise.all(
        regions.map(
          (region) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              let handled = false;
              const finalize = () => {
                if (handled) {
                  return;
                }
                handled = true;
                if (!cancelled) {
                  entries.push([region.id, img]);
                }
                resolve();
              };
              img.onload = finalize;
              img.onerror = () => {
                handled = true;
                resolve();
              };
              img.src = encodeRoomMaskToDataUrl(region.mask);
              if (img.complete) {
                finalize();
              }
            })
        )
      );
      if (!cancelled) {
        setMaskImages(new Map(entries));
      }
    };
    loadImages();
    return () => {
      cancelled = true;
    };
  }, [regions]);

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
      const region = regionById.get(regionId);
      const image = maskImages.get(regionId);
      if (!region || !image) return;
      const { bounds } = region.mask;
      const drawX = bounds.minX * maskWidth;
      const drawY = bounds.minY * maskHeight;
      const drawWidth = Math.max(1, (bounds.maxX - bounds.minX) * maskWidth);
      const drawHeight = Math.max(1, (bounds.maxY - bounds.minY) * maskHeight);
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    });
    context.globalCompositeOperation = 'source-over';
    if (hoverRegion && mode === 'dm') {
      const region = regionById.get(hoverRegion);
      const image = maskImages.get(hoverRegion);
      if (region && image) {
        const { bounds } = region.mask;
        const drawX = bounds.minX * maskWidth;
        const drawY = bounds.minY * maskHeight;
        const drawWidth = Math.max(1, (bounds.maxX - bounds.minX) * maskWidth);
        const drawHeight = Math.max(1, (bounds.maxY - bounds.minY) * maskHeight);
        context.save();
        context.fillStyle = 'rgba(251, 191, 36, 0.2)';
        context.fillRect(drawX, drawY, drawWidth, drawHeight);
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
        context.restore();
      }
    }
  }, [regionById, maskImages, revealedRegionIds, imageSize, hoverRegion, mode, width, height]);

  const handlePointer = (event: React.MouseEvent) => {
    if (!imageSize) return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const region = regions.find((candidate) => roomMaskContainsPoint(candidate.mask, { x, y }));
    setHoverRegion(region?.id ?? null);
  };

  const handleClick = (event: React.MouseEvent) => {
    if (!imageSize) return;
    const rect = (event.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const region = regions.find((candidate) => roomMaskContainsPoint(candidate.mask, { x, y }));
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
