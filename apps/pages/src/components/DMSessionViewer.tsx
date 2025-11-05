import React, { useMemo, useState } from 'react';
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

  const viewWidth = mapWidth ?? 1000;
  const viewHeight = mapHeight ?? 1000;

  const regionOverlays = useMemo(
    () =>
      regions
        .map((region) => {
          const baseColor = normalizeHexColor(region.color) ?? '#facc15';
          const maskUrl = typeof region.maskManifest?.url === 'string' ? region.maskManifest.url.trim() : '';
          const polygon = region.polygon.length > 0 ? region.polygon : roomMaskToPolygon(region.mask);
          if (!maskUrl && polygon.length === 0) {
            return null;
          }
          const centroid = computeCentroid(polygon);
          let fallbackPath: string | null = null;
          if (!maskUrl && polygon.length) {
            fallbackPath = `${
              polygon
                .map((point, index) => {
                  const x = point.x * viewWidth;
                  const y = point.y * viewHeight;
                  return `${index === 0 ? 'M' : 'L'}${x},${y}`;
                })
                .join(' ')
            } Z`;
          }
          return {
            id: region.id,
            name: region.name,
            maskUrl: maskUrl || null,
            centroid,
            polygon,
            fillColor: hexToRgba(baseColor, 0.6),
            strokeColor: hexToRgba(baseColor, 0.75),
            fallbackPath,
          };
        })
        .filter(
          (entry): entry is {
            id: string;
            name: string;
            maskUrl: string | null;
            centroid: { x: number; y: number };
            polygon: Array<{ x: number; y: number }>;
            fillColor: string;
            strokeColor: string;
            fallbackPath: string | null;
          } => Boolean(entry),
        ),
    [regions, viewHeight, viewWidth],
  );

  const markerShapes = useMemo(
    () =>
      (markers ?? []).map((marker) => {
        const color = normalizeHexColor(marker.color) ?? '#facc15';
        const label = marker.label ?? 'Marker';
        return {
          id: marker.id,
          label,
          color,
          position: {
            x: Number(marker.x ?? 0),
            y: Number(marker.y ?? 0),
          },
        };
      }),
    [markers],
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
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative h-full max-h-full w-full max-w-full overflow-hidden"
              style={{
                aspectRatio: viewWidth && viewHeight ? `${viewWidth} / ${viewHeight}` : undefined,
                backgroundColor: 'rgba(15, 23, 42, 0.85)',
              }}
            >
              {mapImageUrl && (
                <img
                  src={mapImageUrl}
                  alt="Map"
                  className="h-full w-full object-contain"
                />
              )}
              {viewMode === 'dm' && (
                <>
                  {regionOverlays.map((region) => (
                    <React.Fragment key={region.id}>
                      {region.maskUrl ? (
                        <div
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundColor: region.fillColor,
                            opacity: 1,
                            maskImage: `url(${region.maskUrl})`,
                            WebkitMaskImage: `url(${region.maskUrl})`,
                            maskMode: 'alpha',
                            WebkitMaskMode: 'alpha',
                            maskRepeat: 'no-repeat',
                            WebkitMaskRepeat: 'no-repeat',
                            maskSize: 'contain',
                            WebkitMaskSize: 'contain',
                            maskPosition: 'center',
                            WebkitMaskPosition: 'center',
                          }}
                        />
                      ) : (
                        region.fallbackPath && (
                          <svg
                            className="pointer-events-none absolute inset-0 h-full w-full"
                            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
                          >
                            <path d={region.fallbackPath} fill={region.fillColor} stroke={region.strokeColor} strokeWidth={2} />
                          </svg>
                        )
                      )}
                      <div
                        className="pointer-events-none absolute"
                        style={{
                          left: `${region.centroid.x * 100}%`,
                          top: `${region.centroid.y * 100}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      >
                        <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-900 shadow-sm dark:bg-slate-900/80 dark:text-amber-100">
                          {region.name}
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                  {markerShapes.map((marker) => (
                    <div
                      key={marker.id}
                      className="pointer-events-none absolute flex flex-col items-center"
                      style={{
                        left: `${marker.position.x * 100}%`,
                        top: `${marker.position.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <div className="mb-2 rounded-full border border-white/50 bg-slate-900/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-100 shadow">
                        {marker.label.toUpperCase()}
                      </div>
                      <div
                        className="h-4 w-4 rounded-full border-2 border-slate-900/80 shadow"
                        style={{ backgroundColor: marker.color }}
                      />
                    </div>
                  ))}
                </>
              )}
              {viewMode === 'playerPreview' && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/70">
                  <span className="text-[18px] font-semibold tracking-[0.35em] text-slate-200">
                    PLAYER PREVIEW COMING SOON
                  </span>
                </div>
              )}
            </div>
          </div>
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
