import React, { useId, useMemo } from 'react';
import type { Marker, Region } from '../types';
import { encodeRoomMaskToDataUrl, roomMaskHasCoverage } from '../utils/roomMask';
import { getMapMarkerIconDefinition, type MapMarkerIconDefinition } from './mapMarkerIcons';

interface PlayerViewProps {
  mapImageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  regions: Region[];
  revealedRegionIds?: string[] | null;
  markers?: Marker[] | null;
  revealedMarkerIds?: string[] | null;
}

interface RevealedMask {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHexColor = (value: string | null | undefined): string | null => {
  if (!value) return null;
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

const getReadableMarkerColor = (hex: string) => {
  const { r, g, b } = rgbFromNormalizedHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0f172a' : '#f8fafc';
};

const resolveMarkerBaseColor = (marker: Marker, definition?: MapMarkerIconDefinition | undefined) => {
  const candidates: Array<string | null | undefined> = [marker.color, definition?.defaultColor, '#facc15'];
  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '#facc15';
};

const fogTextureUrl =
  'https://www.motionforgepictures.com/wp-content/uploads/2023/02/Noise-Texture-featured-image_compressed-2-e1676823834686.jpg';

const PlayerView: React.FC<PlayerViewProps> = ({
  mapImageUrl,
  width,
  height,
  regions,
  revealedRegionIds,
  markers,
  revealedMarkerIds,
}) => {
  const viewWidth = width ?? 1000;
  const viewHeight = height ?? 1000;
  const maskPrefix = useId();
  const maskFilterId = `${maskPrefix}-mask-filter`;
  const fogMaskId = `${maskPrefix}-fog-mask`;
  const largestDimension = Math.max(viewWidth, viewHeight);
  const featherRadius = largestDimension * 0.004;
  const maskPadding = largestDimension * 0.01;
  const filterPadding = maskPadding + featherRadius;

  const revealedMasks = useMemo<RevealedMask[]>(() => {
    const revealedSet = new Set(revealedRegionIds ?? []);
    return regions
      .filter((region) => region.visibleAtStart || revealedSet.has(region.id))
      .filter((region) => roomMaskHasCoverage(region.mask))
      .map((region) => {
        const { bounds } = region.mask;
        const dataUrl = region.maskManifest?.dataUrl ?? encodeRoomMaskToDataUrl(region.mask);
        const maskWidth = Math.max(1, (bounds.maxX - bounds.minX) * viewWidth);
        const maskHeight = Math.max(1, (bounds.maxY - bounds.minY) * viewHeight);
        const maskX = bounds.minX * viewWidth;
        const maskY = bounds.minY * viewHeight;
        const leftExpansion = Math.min(maskPadding, maskX);
        const rightExpansion = Math.min(maskPadding, Math.max(0, viewWidth - (maskX + maskWidth)));
        const topExpansion = Math.min(maskPadding, maskY);
        const bottomExpansion = Math.min(maskPadding, Math.max(0, viewHeight - (maskY + maskHeight)));
        return {
          id: region.id,
          dataUrl,
          x: maskX - leftExpansion,
          y: maskY - topExpansion,
          width: maskWidth + leftExpansion + rightExpansion,
          height: maskHeight + topExpansion + bottomExpansion,
        };
      });
  }, [maskPadding, regions, revealedRegionIds, viewHeight, viewWidth]);

  const markerSprites = useMemo(() => {
    if (!markers || markers.length === 0) {
      return [] as Array<{
        id: string;
        x: number;
        y: number;
        color: string;
        icon?: MapMarkerIconDefinition;
        accent: string;
      }>;
    }
    const revealedRegionsSet = new Set(revealedRegionIds ?? []);
    const revealedMarkerSet = new Set(revealedMarkerIds ?? []);

    return markers
      .map((marker) => {
        const iconDefinition = getMapMarkerIconDefinition(marker.iconKey);
        const baseColor = resolveMarkerBaseColor(marker, iconDefinition);
        const accentColor = getReadableMarkerColor(baseColor);
        const isVisibleAtStart = Boolean(marker.visibleAtStart);
        const isRegionRevealed = marker.regionId ? revealedRegionsSet.has(marker.regionId) : true;
        const explicitlyRevealed = revealedMarkerSet.size > 0 ? revealedMarkerSet.has(marker.id) : false;

        if (!(explicitlyRevealed || (isVisibleAtStart && isRegionRevealed))) {
          return null;
        }

        return {
          id: marker.id,
          x: (marker.x ?? 0) * viewWidth,
          y: (marker.y ?? 0) * viewHeight,
          color: baseColor,
          icon: iconDefinition,
          accent: accentColor,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [markers, revealedRegionIds, revealedMarkerIds, viewHeight, viewWidth]);

  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="block h-full w-full">
      <defs>
        <filter
          id={maskFilterId}
          x={-filterPadding}
          y={-filterPadding}
          width={viewWidth + filterPadding * 2}
          height={viewHeight + filterPadding * 2}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feComponentTransfer result="inverted">
            <feFuncR type="table" tableValues="1 0" />
            <feFuncG type="table" tableValues="1 0" />
            <feFuncB type="table" tableValues="1 0" />
            <feFuncA type="table" tableValues="1 1" />
          </feComponentTransfer>
          <feGaussianBlur in="inverted" stdDeviation={featherRadius} result="feathered" />
          <feColorMatrix
            in="feathered"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1 0 0 0 1"
          />
        </filter>
        <mask id={fogMaskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" maskType="luminance">
          <rect x={0} y={0} width={viewWidth} height={viewHeight} fill="white" />
          {revealedMasks.map((mask) => (
            <image
              key={mask.id}
              href={mask.dataUrl}
              x={mask.x}
              y={mask.y}
              width={mask.width}
              height={mask.height}
              preserveAspectRatio="none"
              filter={`url(#${maskFilterId})`}
            />
          ))}
        </mask>
      </defs>
      {mapImageUrl && (
        <image
          href={mapImageUrl}
          x={0}
          y={0}
          width={viewWidth}
          height={viewHeight}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <g mask={`url(#${fogMaskId})`}>
        <rect x={0} y={0} width={viewWidth} height={viewHeight} fill="#0f172a" />
        <image
          href={fogTextureUrl}
          x={0}
          y={0}
          width={viewWidth}
          height={viewHeight}
          preserveAspectRatio="xMidYMid slice"
          opacity={1}
        />
      </g>
      {markerSprites.map((marker) => {
        const iconElement =
          marker.icon &&
          React.cloneElement(marker.icon.icon, {
            className: undefined,
            width: 20,
            height: 20,
            style: { color: marker.accent },
          });
        return (
          <g key={marker.id} transform={`translate(${marker.x}, ${marker.y})`}>
            <circle r={12} fill={marker.color} stroke="rgba(15, 23, 42, 0.8)" strokeWidth={2} />
            {iconElement ? (
              <g transform="translate(-10, -10)">{iconElement}</g>
            ) : (
              <circle r={4} fill={marker.accent} />
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default PlayerView;
