import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Marker, Region, SessionRecord } from '../types';
import { roomMaskToPolygon } from '../utils/roomMask';

interface DMSessionViewerProps {
  session: SessionRecord;
  mapImageUrl?: string | null;
  mapWidth?: number | null;
  mapHeight?: number | null;
  regions: Region[];
  markers?: Marker[];
  onSaveSnapshot?: () => void;
  onEndSession?: () => void;
  onLeave?: () => void;
}

type ViewMode = 'dm' | 'playerPreview';
type SidebarTab = 'rooms' | 'markers' | 'other';

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

const normalizeHexColor = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = HEX_COLOR_REGEX.exec(trimmed);
  if (!match) return null;
  const hex = match[1];
  if (hex.length === 3) {
    const [r, g, b] = hex.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return `#${hex.toLowerCase()}`;
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return `rgba(250, 204, 21, ${alpha})`;
  }
  const value = normalized.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const computeCentroid = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  let doubleArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const factor = current.x * next.y - next.x * current.y;
    doubleArea += factor;
    centroidX += (current.x + next.x) * factor;
    centroidY += (current.y + next.y) * factor;
  }
  if (Math.abs(doubleArea) < 1e-6) {
    const avgX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const avgY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    return { x: avgX, y: avgY };
  }
  const area = doubleArea / 2;
  return {
    x: centroidX / (6 * area),
    y: centroidY / (6 * area),
  };
};

const DMSessionViewer: React.FC<DMSessionViewerProps> = ({
  session,
  mapImageUrl,
  mapWidth,
  mapHeight,
  regions,
  markers,
  onSaveSnapshot,
  onEndSession,
  onLeave,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('dm');
  const [activeTab, setActiveTab] = useState<SidebarTab>('rooms');
  const [failedMaskIds, setFailedMaskIds] = useState<Record<string, boolean>>({});
  const maskUrlCache = useRef(new Map<string, string | null>());

  const viewWidth = mapWidth ?? 1000;
  const viewHeight = mapHeight ?? 1000;

  const regionOverlays = useMemo(
    () =>
      regions.map((region) => {
        const baseColor = normalizeHexColor(region.color) ?? '#facc15';
        const manifestBounds = region.maskManifest?.bounds;
        const maskBounds = manifestBounds || region.mask.bounds;
        const minX = Number.isFinite(maskBounds?.minX) ? maskBounds.minX : 0;
        const minY = Number.isFinite(maskBounds?.minY) ? maskBounds.minY : 0;
        const maxX = Number.isFinite(maskBounds?.maxX) ? maskBounds.maxX : 1;
        const maxY = Number.isFinite(maskBounds?.maxY) ? maskBounds.maxY : 1;
        const safeMinX = Math.max(0, Math.min(1, minX));
        const safeMinY = Math.max(0, Math.min(1, minY));
        const safeMaxX = Math.max(0, Math.min(1, maxX));
        const safeMaxY = Math.max(0, Math.min(1, maxY));
        const width = Math.max((safeMaxX - safeMinX) * viewWidth, 0);
        const height = Math.max((safeMaxY - safeMinY) * viewHeight, 0);
        const labelPosition = {
          x: (safeMinX + (safeMaxX - safeMinX) / 2) * viewWidth,
          y: (safeMinY + (safeMaxY - safeMinY) / 2) * viewHeight,
        };
        const maskUrl =
          typeof region.maskManifest?.url === 'string' && region.maskManifest.url.length > 0
            ? region.maskManifest.url
            : typeof region.maskManifest?.dataUrl === 'string'
              ? region.maskManifest.dataUrl
              : null;
        return {
          id: region.id,
          name: region.name,
          maskUrl,
          baseColor,
          bounds: {
            minX: safeMinX,
            minY: safeMinY,
            maxX: safeMaxX,
            maxY: safeMaxY,
          },
          width,
          height,
          labelPosition,
          mask: region.mask,
        };
      }),
    [regions, viewHeight, viewWidth],
  );

  useEffect(() => {
    const previousCache = new Map(maskUrlCache.current);
    setFailedMaskIds((prev) => {
      const next: Record<string, boolean> = {};
      const activeIds = new Set(regionOverlays.map((overlay) => overlay.id));
      Object.entries(prev).forEach(([id, value]) => {
        if (activeIds.has(id) && value) {
          next[id] = value;
        }
      });
      regionOverlays.forEach((overlay) => {
        const cached = previousCache.get(overlay.id);
        if (cached !== overlay.maskUrl && overlay.maskUrl) {
          delete next[overlay.id];
        }
      });
      return next;
    });
    const nextCache = new Map<string, string | null>();
    regionOverlays.forEach((overlay) => {
      nextCache.set(overlay.id, overlay.maskUrl);
    });
    maskUrlCache.current = nextCache;
  }, [regionOverlays]);

  const fallbackShapes = useMemo(
    () =>
      regionOverlays
        .filter((overlay) => !overlay.maskUrl || failedMaskIds[overlay.id])
        .map((overlay) => {
          const polygon = roomMaskToPolygon(overlay.mask);
          if (polygon.length === 0) {
            return null;
          }
          const centroid = computeCentroid(polygon);
          const scaledPath = polygon
            .map((point, index) => {
              const x = point.x * viewWidth;
              const y = point.y * viewHeight;
              return `${index === 0 ? 'M' : 'L'}${x},${y}`;
            })
            .join(' ');
          return {
            id: overlay.id,
            name: overlay.name,
            path: `${scaledPath} Z`,
            centroid: {
              x: centroid.x * viewWidth,
              y: centroid.y * viewHeight,
            },
            fillColor: hexToRgba(overlay.baseColor, 0.15),
            strokeColor: hexToRgba(overlay.baseColor, 0.6),
          };
        })
        .filter(
          (shape): shape is {
            id: string;
            name: string;
            path: string;
            centroid: { x: number; y: number };
            fillColor: string;
            strokeColor: string;
          } => Boolean(shape),
        ),
    [failedMaskIds, regionOverlays, viewHeight, viewWidth],
  );

  const handleMaskError = useCallback((regionId: string) => {
    setFailedMaskIds((prev) => {
      if (prev[regionId]) {
        return prev;
      }
      return { ...prev, [regionId]: true };
    });
  }, []);

  const handleMaskLoad = useCallback((regionId: string) => {
    setFailedMaskIds((prev) => {
      if (!prev[regionId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[regionId];
      return next;
    });
  }, []);

  const markerShapes = useMemo(
    () =>
      (markers ?? []).map((marker) => {
        const color = normalizeHexColor(marker.color) ?? '#facc15';
        const label = marker.label ?? 'Marker';
        const labelWidth = Math.max(72, label.length * 8 + 24);
        return {
          id: marker.id,
          label,
          color,
          labelWidth,
          position: {
            x: (marker.x ?? 0) * viewWidth,
            y: (marker.y ?? 0) * viewHeight,
          },
        };
      }),
    [markers, viewHeight, viewWidth],
  );

  const toggleViewMode = () => {
    setViewMode((current) => (current === 'dm' ? 'playerPreview' : 'dm'));
  };

  const tabButtonClasses = (tab: SidebarTab) =>
    `flex-1 border-b-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.35em] transition ${
      activeTab === tab
        ? 'border-amber-400 text-amber-600 dark:border-amber-400 dark:text-amber-200'
        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="flex h-[78vh] min-h-[540px] flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <header className="flex h-12 items-center justify-between border-b border-white/30 bg-white/40 px-4 text-[11px] uppercase tracking-[0.35em] backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60">
        <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
          <span className="text-[10px] font-semibold tracking-[0.4em] text-slate-600 dark:text-slate-400">DM SESSION</span>
          <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold tracking-[0.45em] text-slate-900 shadow-sm dark:bg-slate-800/70 dark:text-amber-200">
            {session.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSaveSnapshot}
            className="rounded-full border border-amber-400/70 bg-amber-300/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:bg-amber-300/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
          >
            Save Snapshot
          </button>
          <button
            type="button"
            className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
          >
            Players
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="rounded-full border border-rose-500/80 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-600 transition hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-400/70 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
          >
            End Session
          </button>
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              className="rounded-full border border-white/50 bg-white/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-600 transition hover:border-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-white"
            >
              Leave
            </button>
          )}
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-[4] bg-slate-950/25" style={{ minHeight: 0 }}>
          <div className="absolute left-4 top-4 z-10">
            <button
              type="button"
              onClick={toggleViewMode}
              className="rounded-full bg-slate-900/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-200 shadow-lg backdrop-blur transition hover:bg-slate-900/70 dark:bg-slate-900/80"
            >
              {viewMode === 'dm' ? 'DM View' : 'Player Preview'}
            </button>
          </div>
          <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-full w-full">
            <rect x={0} y={0} width={viewWidth} height={viewHeight} fill="rgba(15, 23, 42, 0.85)" />
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
            {viewMode === 'dm' && (
              <defs>
                {regionOverlays
                  .filter((overlay) => overlay.maskUrl && !failedMaskIds[overlay.id])
                  .map((overlay) => (
                    <mask id={`region-mask-${overlay.id}`} key={`mask-${overlay.id}`}>
                      <image
                        href={overlay.maskUrl ?? undefined}
                        x={overlay.bounds.minX * viewWidth}
                        y={overlay.bounds.minY * viewHeight}
                        width={overlay.width}
                        height={overlay.height}
                        preserveAspectRatio="none"
                        onError={() => handleMaskError(overlay.id)}
                        onLoad={() => handleMaskLoad(overlay.id)}
                      />
                    </mask>
                  ))}
              </defs>
            )}
            {viewMode === 'dm' &&
              regionOverlays
                .filter((overlay) => overlay.maskUrl && !failedMaskIds[overlay.id])
                .map((overlay) => (
                  <g key={overlay.id}>
                    <rect
                      x={overlay.bounds.minX * viewWidth}
                      y={overlay.bounds.minY * viewHeight}
                      width={overlay.width}
                      height={overlay.height}
                      fill={hexToRgba(overlay.baseColor, 0.2)}
                      mask={`url(#region-mask-${overlay.id})`}
                    />
                    <text
                      x={overlay.labelPosition.x}
                      y={overlay.labelPosition.y}
                      textAnchor="middle"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        fill: '#1f2937',
                        stroke: 'rgba(255, 255, 255, 0.8)',
                        strokeWidth: 3,
                        strokeLinejoin: 'round',
                        paintOrder: 'stroke',
                      }}
                    >
                      {overlay.name}
                    </text>
                  </g>
                ))}
            {viewMode === 'dm' &&
              fallbackShapes.map((shape) => (
                <g key={shape.id}>
                  <path d={shape.path} fill={shape.fillColor} stroke={shape.strokeColor} strokeWidth={2} />
                  <text
                    x={shape.centroid.x}
                    y={shape.centroid.y}
                    textAnchor="middle"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      fill: '#1f2937',
                      stroke: 'rgba(255, 255, 255, 0.8)',
                      strokeWidth: 3,
                      strokeLinejoin: 'round',
                      paintOrder: 'stroke',
                    }}
                  >
                    {shape.name}
                  </text>
                </g>
              ))}
            {viewMode === 'dm' &&
              markerShapes.map((marker) => (
                <g key={marker.id} transform={`translate(${marker.position.x}, ${marker.position.y})`}>
                  <rect
                    x={-marker.labelWidth / 2}
                    y={-42}
                    width={marker.labelWidth}
                    height={26}
                    rx={13}
                    fill="rgba(15, 23, 42, 0.7)"
                    stroke="rgba(203, 213, 225, 0.6)"
                    strokeWidth={1.5}
                  />
                  <text
                    x={0}
                    y={-24}
                    textAnchor="middle"
                    style={{ fontSize: 12, fontWeight: 600, fill: '#e2e8f0', letterSpacing: '0.25em' }}
                  >
                    {marker.label.toUpperCase()}
                  </text>
                  <circle r={10} fill={marker.color} stroke="rgba(15, 23, 42, 0.85)" strokeWidth={2} />
                </g>
              ))}
            {viewMode === 'playerPreview' && (
              <g>
                <rect x={0} y={0} width={viewWidth} height={viewHeight} fill="rgba(15, 23, 42, 0.7)" />
                <text
                  x={viewWidth / 2}
                  y={viewHeight / 2}
                  textAnchor="middle"
                  style={{ fontSize: 18, fontWeight: 600, fill: '#f1f5f9', letterSpacing: '0.35em' }}
                >
                  PLAYER PREVIEW COMING SOON
                </text>
              </g>
            )}
          </svg>
        </div>
        <aside className="flex flex-[1] flex-col border-l border-white/30 bg-white/30 backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/50">
          <div className="flex">
            <button type="button" className={tabButtonClasses('rooms')} onClick={() => setActiveTab('rooms')}>
              Rooms
            </button>
            <button type="button" className={tabButtonClasses('markers')} onClick={() => setActiveTab('markers')}>
              Markers
            </button>
            <button type="button" className={tabButtonClasses('other')} onClick={() => setActiveTab('other')}>
              Other
            </button>
          </div>
          <div className="flex flex-1 flex-col" />
        </aside>
      </div>
    </div>
  );
};

export default DMSessionViewer;
