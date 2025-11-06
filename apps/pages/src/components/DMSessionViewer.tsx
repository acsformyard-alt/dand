import React, { useMemo, useState } from 'react';
import type { Marker, Region, SessionRecord } from '../types';
import { computeRoomMaskCentroid, encodeRoomMaskToDataUrl, roomMaskHasCoverage } from '../utils/roomMask';

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
          if (!roomMaskHasCoverage(region.mask)) {
            return null;
          }
          const baseColor = normalizeHexColor(region.color) ?? '#facc15';
          const centroid = computeRoomMaskCentroid(region.mask);
          const bounds = region.mask.bounds;
          const dataUrl = region.maskManifest?.dataUrl ?? encodeRoomMaskToDataUrl(region.mask);
          return {
            id: region.id,
            name: region.name,
            centroid: {
              x: centroid.x * viewWidth,
              y: centroid.y * viewHeight,
            },
            bounds,
            dataUrl,
            fillColor: hexToRgba(baseColor, 0.2),
          };
        })
        .filter(
          (entry): entry is {
            id: string;
            name: string;
            centroid: { x: number; y: number };
            bounds: Region['mask']['bounds'];
            dataUrl: string;
            fillColor: string;
          } => Boolean(entry),
        ),
    [regions, viewHeight, viewWidth],
  );

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
    <div className="relative flex min-h-[540px] w-full flex-1 flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 text-[10px] uppercase tracking-[0.4em] backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/70">
          <span className="font-semibold text-slate-700 dark:text-slate-300">DM Session</span>
          <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold tracking-[0.45em] text-slate-900 shadow-sm dark:bg-slate-800/70 dark:text-amber-200">
            {session.name}
          </span>
          <button
            type="button"
            onClick={toggleViewMode}
            className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-[10px] font-semibold tracking-[0.35em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
          >
            {viewMode === 'dm' ? 'DM View' : 'Player Preview'}
          </button>
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-end gap-2 rounded-2xl border border-white/50 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/70">
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
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden pt-12">
        <div className="relative min-h-0 flex-[4] bg-slate-950/25">
          <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-full w-full">
            <defs>
              {regionOverlays.map((overlay) => {
                const maskId = `region-mask-${overlay.id}`;
                const { bounds } = overlay;
                const maskX = bounds.minX * viewWidth;
                const maskY = bounds.minY * viewHeight;
                const maskWidth = Math.max(1, (bounds.maxX - bounds.minX) * viewWidth);
                const maskHeight = Math.max(1, (bounds.maxY - bounds.minY) * viewHeight);
                return (
                  <mask id={maskId} key={maskId} maskUnits="userSpaceOnUse">
                    <rect x={0} y={0} width={viewWidth} height={viewHeight} fill="black" />
                    <image
                      href={overlay.dataUrl}
                      x={maskX}
                      y={maskY}
                      width={maskWidth}
                      height={maskHeight}
                      preserveAspectRatio="none"
                    />
                  </mask>
                );
              })}
            </defs>
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
              <>
                {regionOverlays.map((overlay) => (
                  <g key={`overlay-${overlay.id}`} mask={`url(#region-mask-${overlay.id})`}>
                    <rect x={0} y={0} width={viewWidth} height={viewHeight} fill={overlay.fillColor} />
                  </g>
                ))}
                {regionOverlays.map((overlay) => (
                  <text
                    key={`label-${overlay.id}`}
                    x={overlay.centroid.x}
                    y={overlay.centroid.y}
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
                ))}
              </>
            )}
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
        <aside className="flex min-h-0 flex-[1] flex-col border-l border-white/30 bg-white/30 backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/50">
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
          <div className="flex min-h-0 flex-1 flex-col" />
        </aside>
      </div>
    </div>
  );
};

export default DMSessionViewer;
