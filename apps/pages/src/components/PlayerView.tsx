import React, { useId, useMemo } from 'react';
import type { Region } from '../types';
import { encodeRoomMaskToDataUrl, roomMaskHasCoverage } from '../utils/roomMask';

interface PlayerViewProps {
  mapImageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  regions: Region[];
  revealedRegionIds?: string[] | null;
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

const PlayerView: React.FC<PlayerViewProps> = ({ mapImageUrl, width, height, regions, revealedRegionIds }) => {
  const viewWidth = width ?? 1000;
  const viewHeight = height ?? 1000;
  const maskPrefix = useId();
  const invertFilterId = `${maskPrefix}-invert-filter`;
  const fogMaskId = `${maskPrefix}-fog-mask`;

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
        return {
          id: region.id,
          dataUrl,
          x: bounds.minX * viewWidth,
          y: bounds.minY * viewHeight,
          width: maskWidth,
          height: maskHeight,
        };
      });
  }, [regions, revealedRegionIds, viewHeight, viewWidth]);

  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-full w-full">
      <defs>
        <filter id={invertFilterId} colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncR type="table" tableValues="1 0" />
            <feFuncG type="table" tableValues="1 0" />
            <feFuncB type="table" tableValues="1 0" />
            <feFuncA type="table" tableValues="1 1" />
          </feComponentTransfer>
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
              filter={`url(#${invertFilterId})`}
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
        <rect x={0} y={0} width={viewWidth} height={viewHeight} fill="rgba(15, 23, 42, 0.78)" />
        <image
          href={fogTextureUrl}
          x={0}
          y={0}
          width={viewWidth}
          height={viewHeight}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.4}
        />
      </g>
    </svg>
  );
};

export default PlayerView;
