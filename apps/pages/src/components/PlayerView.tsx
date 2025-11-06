import React, { useId, useMemo } from 'react';
import type { Region } from '../types';
import { encodeRoomMaskToDataUrl, roomMaskHasCoverage } from '../utils/roomMask';

interface PlayerViewProps {
  mapImageUrl?: string | null;
  width?: number | null;
  height?: number | null;
  regions: Region[];
  revealedRegionIds?: string[] | null;
  availableWidth?: number;
  availableHeight?: number;
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
  availableWidth,
  availableHeight,
}) => {
  const viewWidth = width ?? 1000;
  const viewHeight = height ?? 1000;
  const maskPrefix = useId();
  const maskFilterId = `${maskPrefix}-mask-filter`;
  const fogMaskId = `${maskPrefix}-fog-mask`;
  const featherRadius = Math.max(viewWidth, viewHeight) * 0.02;

  const scale = useMemo(() => {
    if (!availableWidth || !availableHeight) {
      return 1;
    }

    const widthScale = availableWidth / viewWidth;
    const heightScale = availableHeight / viewHeight;

    return Math.min(1, widthScale, heightScale);
  }, [availableHeight, availableWidth, viewHeight, viewWidth]);

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
    <div className="flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="flex items-center justify-center"
        style={{
          width: viewWidth,
          height: viewHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} width={viewWidth} height={viewHeight} className="block">
          <defs>
            <filter
              id={maskFilterId}
              x={-featherRadius}
              y={-featherRadius}
              width={viewWidth + featherRadius * 2}
              height={viewHeight + featherRadius * 2}
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
              <feComponentTransfer in="feathered">
                <feFuncR type="identity" />
                <feFuncG type="identity" />
                <feFuncB type="identity" />
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
      </div>
    </div>
  );
};

export default PlayerView;
