import React, { useId, useMemo } from 'react';
import type { Marker, Region } from '../types';
import { encodeRoomMaskToDataUrl, roomMaskHasCoverage } from '../utils/roomMask';
import {
  getReadableTextColor,
  normaliseMarkers,
  resolveMarkerBaseColor,
  rgbaFromNormalizedHex,
} from '../utils/markerUtils';
import { getMapMarkerIconDefinition } from './mapMarkerIcons';

interface PlayerViewProps {
  mapImageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  regions: Region[];
  revealedRegionIds?: string[] | null;
  markers?: Record<string, Marker> | Marker[];
  sessionMarkers?: Record<string, Marker> | Marker[];
}

interface RevealedMask {
  id: string;
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const fogTextureUrl =
  'https://www.motionforgepictures.com/wp-content/uploads/2023/02/Noise-Texture-featured-image_compressed-2-e1676823834686.jpg';

const PlayerView: React.FC<PlayerViewProps> = ({
  mapImageUrl,
  width,
  height,
  regions,
  revealedRegionIds,
  markers,
  sessionMarkers,
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

  const markerBadges = useMemo(() => {
    const revealedSet = new Set(revealedRegionIds ?? []);
    regions.forEach((region) => {
      if (region.visibleAtStart) {
        revealedSet.add(region.id);
      }
    });

    const baseMarkers = normaliseMarkers(markers).filter((marker) => {
      if (marker.visibleAtStart) {
        return true;
      }
      const linkedRegionId = marker.regionId?.trim();
      if (linkedRegionId && revealedSet.has(linkedRegionId)) {
        return true;
      }
      return false;
    });

    const sessionMarkerEntries = normaliseMarkers(sessionMarkers);

    const combined = [...baseMarkers, ...sessionMarkerEntries];

    return combined.map((marker) => {
      const iconDefinition = getMapMarkerIconDefinition(marker.iconKey);
      const baseColor = resolveMarkerBaseColor(marker, iconDefinition);
      const displayLabel = marker.label?.trim().length ? marker.label.trim() : 'Marker';
      const textColor = getReadableTextColor(baseColor);
      return {
        id: marker.id,
        label: displayLabel.toUpperCase(),
        left: `${(marker.x ?? 0) * 100}%`,
        top: `${(marker.y ?? 0) * 100}%`,
        baseColor,
        backgroundColor: rgbaFromNormalizedHex(baseColor, 0.65),
        borderColor: rgbaFromNormalizedHex(baseColor, 0.85),
        textColor,
        icon: iconDefinition
          ? React.cloneElement(iconDefinition.icon, {
              className: undefined,
              width: 16,
              height: 16,
              style: { display: 'block', color: textColor },
            })
          : null,
      };
    });
  }, [markers, regions, revealedRegionIds, sessionMarkers]);

  return (
    <div className="relative h-full w-full">
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
      </svg>
      {markerBadges.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          {markerBadges.map((marker) => (
            <div
              key={marker.id}
              className="absolute flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] shadow"
              style={{
                left: marker.left,
                top: marker.top,
                backgroundColor: marker.backgroundColor,
                borderColor: marker.borderColor,
                color: marker.textColor,
              }}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: marker.baseColor }} />
              {marker.icon && <span className="flex h-4 w-4 items-center justify-center">{marker.icon}</span>}
              {marker.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlayerView;
