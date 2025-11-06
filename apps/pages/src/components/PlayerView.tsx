import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const PlayerView: React.FC<PlayerViewProps> = ({ mapImageUrl, width, height, regions, revealedRegionIds }) => {
  const viewWidth = width ?? 1000;
  const viewHeight = height ?? 1000;
  const maskPrefix = useId();
  const maskFilterId = `${maskPrefix}-mask-filter`;
  const fogMaskId = `${maskPrefix}-fog-mask`;
  const featherRadius = Math.max(viewWidth, viewHeight) * 0.02;

  const [fogLoaded, setFogLoaded] = useState(false);
  const [loadedMaskIds, setLoadedMaskIds] = useState<string[]>([]);
  const [pendingMaskIds, setPendingMaskIds] = useState<string[]>([]);
  const [animatingMaskIds, setAnimatingMaskIds] = useState<string[]>([]);
  const [completedMaskIds, setCompletedMaskIds] = useState<string[]>([]);
  const [revealOpacity, setRevealOpacity] = useState(1);
  const animationFrameRef = useRef<number | null>(null);

  const loadedMaskIdSet = useMemo(() => new Set(loadedMaskIds), [loadedMaskIds]);
  const completedMaskIdSet = useMemo(() => new Set(completedMaskIds), [completedMaskIds]);
  const animatingMaskIdSet = useMemo(() => new Set(animatingMaskIds), [animatingMaskIds]);
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

  useEffect(() => {
    const currentIds = revealedMasks.map((mask) => mask.id);
    const currentIdSet = new Set(currentIds);

    setLoadedMaskIds((prev) => {
      const filtered = prev.filter((id) => currentIdSet.has(id));
      return arraysEqual(filtered, prev) ? prev : filtered;
    });

    setCompletedMaskIds((prev) => {
      const filtered = prev.filter((id) => currentIdSet.has(id));
      return arraysEqual(filtered, prev) ? prev : filtered;
    });

    setPendingMaskIds((prev) => {
      const filteredPrev = prev.filter((id) => currentIdSet.has(id) && !animatingMaskIdSet.has(id));
      const pendingSet = new Set(filteredPrev);
      currentIds.forEach((id) => {
        if (!completedMaskIdSet.has(id) && !animatingMaskIdSet.has(id)) {
          pendingSet.add(id);
        }
      });
      const next = Array.from(pendingSet);
      return arraysEqual(next, prev) ? prev : next;
    });
  }, [revealedMasks, animatingMaskIdSet, completedMaskIdSet]);

  useEffect(() => {
    if (animatingMaskIds.length > 0) {
      return;
    }

    if (pendingMaskIds.length === 0) {
      return;
    }

    setAnimatingMaskIds([...pendingMaskIds]);
    setPendingMaskIds([]);
    setRevealOpacity(1);
  }, [animatingMaskIds, pendingMaskIds]);

  useEffect(() => {
    if (!fogLoaded) {
      return;
    }

    if (animatingMaskIds.length === 0) {
      return;
    }

    const allMasksLoaded = animatingMaskIds.every((id) => loadedMaskIdSet.has(id));
    if (!allMasksLoaded) {
      return;
    }

    const duration = 600;
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (startTime === null) {
        startTime = timestamp;
      }
      const progress = Math.min((timestamp - startTime) / duration, 1);
      setRevealOpacity(1 - progress);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      setCompletedMaskIds((prev) => {
        const merged = new Set(prev);
        animatingMaskIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      });
      setAnimatingMaskIds([]);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [animatingMaskIds, fogLoaded, loadedMaskIdSet]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="block h-full w-full">
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
          {revealedMasks.map((mask) => {
            const isAnimating = animatingMaskIdSet.has(mask.id);
            const isComplete = completedMaskIdSet.has(mask.id);
            const maskOpacity = isComplete ? 1 : isAnimating ? 1 - revealOpacity : 0;

            return (
              <image
                key={mask.id}
                href={mask.dataUrl}
                x={mask.x}
                y={mask.y}
                width={mask.width}
                height={mask.height}
                preserveAspectRatio="none"
                filter={`url(#${maskFilterId})`}
                opacity={maskOpacity}
                onLoad={() => {
                  setLoadedMaskIds((prev) => (prev.includes(mask.id) ? prev : [...prev, mask.id]));
                }}
              />
            );
          })}
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
          onLoad={() => setFogLoaded(true)}
        />
      </g>
    </svg>
  );
};

export default PlayerView;
