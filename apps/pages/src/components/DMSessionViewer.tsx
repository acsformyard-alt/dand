import React, { useCallback, useMemo, useState } from 'react';
import type { Marker, Region, SessionLiveMarker, SessionRecord } from '../types';
import { computeRoomMaskCentroid, encodeRoomMaskToDataUrl, roomMaskHasCoverage } from '../utils/roomMask';
import PlayerView from './PlayerView';
import { getMapMarkerIconDefinition, type MapMarkerIconDefinition } from './mapMarkerIcons';

interface DMSessionViewerProps {
  session: SessionRecord;
  mapImageUrl?: string | null;
  mapWidth?: number | null;
  mapHeight?: number | null;
  regions: Region[];
  markers?: Marker[];
  revealedRegionIds?: string[];
  revealedMarkerIds?: string[];
  liveMarkers?: SessionLiveMarker[];
  onRevealRegions?: (regionIds: string[]) => void;
  onHideRegions?: (regionIds: string[]) => void;
  onRevealMarkers?: (markerIds: string[]) => void;
  onSaveSnapshot?: () => void;
  onEndSession?: () => void;
  onLeave?: () => void;
}

type ViewMode = 'dm' | 'player';
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

const resolveMarkerBaseColor = (marker: Marker, definition?: MapMarkerIconDefinition) => {
  const candidates: Array<string | null | undefined> = [marker.color, definition?.defaultColor, '#facc15'];
  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '#facc15';
};

const parseTagList = (value?: string | null) => {
  if (!value) return [] as string[];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const formatDateTimeLabel = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPercent = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
};

const describeMarkerKind = (marker: Marker) => {
  if (marker.kind === 'area') {
    if (marker.areaShape === 'circle') return 'Area: Circle';
    if (marker.areaShape === 'polygon') return 'Area: Polygon';
    return 'Area Marker';
  }
  return 'Point Marker';
};

const DMSessionViewer: React.FC<DMSessionViewerProps> = ({
  session,
  mapImageUrl,
  mapWidth,
  mapHeight,
  regions,
  markers,
  revealedRegionIds,
  revealedMarkerIds,
  liveMarkers,
  onRevealRegions,
  onHideRegions,
  onRevealMarkers,
  onSaveSnapshot,
  onEndSession,
  onLeave,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('dm');
  const [activeTab, setActiveTab] = useState<SidebarTab>('rooms');

  const viewWidth = mapWidth ?? 1000;
  const viewHeight = mapHeight ?? 1000;

  const playerRevealedRegionIds = useMemo(
    () =>
      (revealedRegionIds && revealedRegionIds.length > 0
        ? revealedRegionIds
        : regions.filter((region) => region.visibleAtStart).map((region) => region.id)),
    [regions, revealedRegionIds],
  );

  const sessionMarkerRecords = useMemo<Marker[]>(() => {
    if (!liveMarkers || liveMarkers.length === 0) {
      return [];
    }
    return liveMarkers.map((marker) => ({
      id: marker.id,
      mapId: session.mapId,
      label: marker.label,
      x: Number.isFinite(marker.x) ? marker.x : 0,
      y: Number.isFinite(marker.y) ? marker.y : 0,
      color: marker.color ?? undefined,
      iconKey: marker.iconKey ?? undefined,
      notes: marker.notes ?? undefined,
      visibleAtStart: true,
      kind: 'point',
    }));
  }, [liveMarkers, session.mapId]);

  const displayMarkers = useMemo(() => {
    const baseMarkers = markers ?? [];
    if (sessionMarkerRecords.length === 0) {
      return baseMarkers;
    }
    return [...baseMarkers, ...sessionMarkerRecords];
  }, [markers, sessionMarkerRecords]);

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
      displayMarkers.map((marker) => {
        const iconDefinition = getMapMarkerIconDefinition(marker.iconKey);
        const baseColor = resolveMarkerBaseColor(marker, iconDefinition);
        const label = marker.label ?? 'Marker';
        const labelWidth = Math.max(80, label.length * 8 + 40);
        const accent = getReadableMarkerColor(baseColor);
        return {
          id: marker.id,
          label,
          color: baseColor,
          labelWidth,
          icon: iconDefinition,
          accent,
          position: {
            x: (marker.x ?? 0) * viewWidth,
            y: (marker.y ?? 0) * viewHeight,
          },
        };
      }),
    [displayMarkers, viewHeight, viewWidth],
  );

  const [expandedRegionIds, setExpandedRegionIds] = useState<Set<string>>(() => new Set());

  const toggleRegionExpanded = useCallback((regionId: string) => {
    setExpandedRegionIds((current) => {
      const next = new Set(current);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  }, []);

  const revealedRegionsSet = useMemo(() => new Set(playerRevealedRegionIds), [playerRevealedRegionIds]);
  const revealedMarkersSet = useMemo(() => new Set(revealedMarkerIds ?? []), [revealedMarkerIds]);

  const sortedRegions = useMemo(() => {
    return [...regions].sort((a, b) => {
      const aOrder = a.revealOrder ?? Number.POSITIVE_INFINITY;
      const bOrder = b.revealOrder ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }, [regions]);

  const sortedMarkers = useMemo(() => {
    return [...displayMarkers].sort((a, b) => a.label.localeCompare(b.label));
  }, [displayMarkers]);

  const regionNamesById = useMemo(() => {
    const map = new Map<string, string>();
    regions.forEach((region) => {
      map.set(region.id, region.name);
    });
    return map;
  }, [regions]);

  const handleRevealRegion = useCallback(
    (region: Region) => {
      if (!onRevealRegions) return;
      const confirmReveal = window.confirm(`Reveal "${region.name}" to players?`);
      if (!confirmReveal) return;
      onRevealRegions([region.id]);
    },
    [onRevealRegions],
  );

  const handleHideRegion = useCallback(
    (region: Region) => {
      if (!onHideRegions) return;
      const confirmHide = window.confirm(`Hide "${region.name}" from players?`);
      if (!confirmHide) return;
      onHideRegions([region.id]);
    },
    [onHideRegions],
  );

  const handleRevealMarker = useCallback(
    (marker: Marker) => {
      if (!onRevealMarkers) return;
      const confirmReveal = window.confirm(`Reveal marker "${marker.label}" to players?`);
      if (!confirmReveal) return;
      onRevealMarkers([marker.id]);
    },
    [onRevealMarkers],
  );

  const totalVisibleAtStart = useMemo(() => regions.filter((region) => region.visibleAtStart).length, [regions]);
  const totalMarkersVisibleAtStart = useMemo(
    () => sortedMarkers.filter((marker) => marker.visibleAtStart).length,
    [sortedMarkers],
  );

  const toggleViewMode = () => {
    setViewMode((current) => (current === 'dm' ? 'player' : 'dm'));
  };

  const tabButtonClasses = (tab: SidebarTab) =>
    `flex-1 border-b-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.35em] transition ${
      activeTab === tab
        ? 'border-amber-400 text-amber-600 dark:border-amber-400 dark:text-amber-200'
        : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="relative flex h-full min-h-[540px] w-full max-h-screen flex-1 flex-col overflow-hidden text-slate-900 dark:text-slate-100">
      <header className="flex h-12 items-center justify-between border-b border-white/30 bg-white/40 px-4 text-[11px] uppercase tracking-[0.35em] backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/60">
        <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
          <span className="text-[10px] font-semibold tracking-[0.4em] text-slate-600 dark:text-slate-400">DM SESSION</span>
          <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold tracking-[0.45em] text-slate-900 shadow-sm dark:bg-slate-800/70 dark:text-amber-200">
            {session.name}
          </span>
          <button
            type="button"
            onClick={toggleViewMode}
            className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
          >
            {viewMode === 'dm' ? 'DM View' : 'Player View'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {onSaveSnapshot && (
            <button
              type="button"
              onClick={onSaveSnapshot}
              className="rounded-full border border-amber-400/70 bg-amber-300/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:bg-amber-300/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
            >
              Save Snapshot
            </button>
          )}
          <button
            type="button"
            className="rounded-full border border-white/60 bg-white/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-700 transition hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-amber-400/60 dark:hover:text-amber-200"
          >
            Players
          </button>
          {onEndSession && (
            <button
              type="button"
              onClick={onEndSession}
              className="rounded-full border border-rose-500/80 bg-rose-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-600 transition hover:bg-rose-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-400/70 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
            >
              End Session
            </button>
          )}
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
      <div className="flex min-h-0 h-full flex-1 overflow-hidden">
        <div 
          className="relative min-h-0 h-full flex-[4] bg-slate-950/25"
          style={{ maxHeight: '92vh' }}
        >
          {viewMode === 'dm' ? (
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
              {markerShapes.map((marker) => {
                const iconElement =
                  marker.icon &&
                  React.cloneElement(marker.icon.icon, {
                    className: undefined,
                    width: 20,
                    height: 20,
                    style: { color: marker.accent },
                  });
                return (
                  <g key={marker.id} transform={`translate(${marker.position.x}, ${marker.position.y})`}>
                    <rect
                      x={-marker.labelWidth / 2}
                      y={-44}
                      width={marker.labelWidth}
                      height={28}
                      rx={14}
                      fill="rgba(15, 23, 42, 0.75)"
                      stroke="rgba(203, 213, 225, 0.65)"
                      strokeWidth={1.5}
                    />
                    <text
                      x={0}
                      y={-26}
                      textAnchor="middle"
                      style={{ fontSize: 12, fontWeight: 600, fill: '#e2e8f0', letterSpacing: '0.25em' }}
                    >
                      {marker.label.toUpperCase()}
                    </text>
                    <circle r={12} fill={marker.color} stroke="rgba(15, 23, 42, 0.85)" strokeWidth={2} />
                    {iconElement ? (
                      <g transform="translate(-10, -10)">{iconElement}</g>
                    ) : (
                      <circle r={4} fill={marker.accent} />
                    )}
                  </g>
                );
              })}
            </svg>
          ) : (
          <PlayerView
            mapImageUrl={mapImageUrl}
            width={viewWidth}
            height={viewHeight}
            regions={regions}
            revealedRegionIds={playerRevealedRegionIds}
            markers={displayMarkers}
            revealedMarkerIds={revealedMarkerIds}
          />
        )}
        </div>
        <aside className="flex min-h-0 h-full flex-[1] flex-col overflow-hidden border-l border-white/30 bg-white/30 backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/50">
          <div 
            className="flex"
            style={{ maxHeight: '4vh' }}
          >
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
          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{ maxHeight: '88vh' }}
          >
            {activeTab === 'rooms' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {sortedRegions.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-xs uppercase tracking-[0.3em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    No rooms defined for this map.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sortedRegions.map((region) => {
                      const isExpanded = expandedRegionIds.has(region.id);
                      const tags = parseTagList(region.tags);
                      const revealed = revealedRegionsSet.has(region.id);
                      const revealLabel = revealed
                        ? 'Revealed'
                        : region.visibleAtStart
                          ? 'Visible at Start'
                          : 'Hidden';
                      const statusColor = revealed
                        ? 'text-emerald-500 dark:text-emerald-300'
                        : region.visibleAtStart
                          ? 'text-amber-500 dark:text-amber-300'
                          : 'text-slate-500 dark:text-slate-400';
                      const regionColor = normalizeHexColor(region.color);
                      const canReveal = Boolean(onRevealRegions) && !revealed;
                      const canHide = Boolean(onHideRegions) && revealed;
                      const revealButtonLabel = revealed
                        ? canHide
                          ? 'Hide from Players'
                          : 'Already Revealed'
                        : 'Reveal to Players';
                      const revealButtonClasses = revealed
                        ? canHide
                          ? 'w-full rounded-full border border-rose-400/70 bg-rose-200/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-700 transition hover:bg-rose-200/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 dark:border-rose-400/60 dark:bg-rose-400/20 dark:text-rose-100 dark:hover:bg-rose-400/30'
                          : 'w-full cursor-not-allowed rounded-full border border-emerald-400/50 bg-emerald-300/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200'
                        : canReveal
                          ? 'w-full rounded-full border border-amber-400/70 bg-amber-300/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:bg-amber-300/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30'
                          : 'w-full cursor-not-allowed rounded-full border border-slate-300/60 bg-slate-200/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500';
                      const handleRegionAction = revealed
                        ? () => handleHideRegion(region)
                        : () => handleRevealRegion(region);
                      return (
                        <div
                          key={region.id}
                          className="overflow-hidden rounded-2xl border border-white/60 bg-white/60 shadow-sm transition dark:border-slate-800/60 dark:bg-slate-900/50"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/70 dark:hover:bg-slate-900/70"
                            onClick={() => toggleRegionExpanded(region.id)}
                            aria-expanded={isExpanded}
                          >
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-800 dark:text-slate-100">
                                {region.name}
                              </p>
                              <p className={`text-[10px] font-semibold uppercase tracking-[0.4em] ${statusColor}`}>
                                {revealLabel}
                              </p>
                            </div>
                            <span className="text-lg text-slate-500 transition dark:text-slate-400" aria-hidden>
                              {isExpanded ? '−' : '+'}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="space-y-4 border-t border-white/60 px-4 py-4 text-sm text-slate-700 dark:border-slate-800/60 dark:text-slate-200">
                              {region.description && (
                                <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{region.description}</p>
                              )}
                              {tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded-full bg-amber-200/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-amber-700 dark:bg-amber-400/20 dark:text-amber-200"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-[10px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
                                <div className="flex flex-col gap-1">
                                  <dt>Visible at Start</dt>
                                  <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                    {region.visibleAtStart ? 'Yes' : 'No'}
                                  </dd>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <dt>Reveal Order</dt>
                                  <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                    {region.revealOrder ?? '—'}
                                  </dd>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <dt>Currently Revealed</dt>
                                  <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                    {revealed ? 'Yes' : 'No'}
                                  </dd>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <dt>Region Color</dt>
                                  <dd className="flex items-center gap-2 text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                    {regionColor ? (
                                      <>
                                        <span
                                          className="h-3 w-3 rounded-full border border-white/60 shadow-sm dark:border-slate-700"
                                          style={{ backgroundColor: regionColor }}
                                        />
                                        <span>{regionColor.toUpperCase()}</span>
                                      </>
                                    ) : (
                                      '—'
                                    )}
                                  </dd>
                                </div>
                              </dl>
                              {region.notes && (
                                <div className="space-y-1">
                                  <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">DM Notes</p>
                                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                                    {region.notes}
                                  </p>
                                </div>
                              )}
                              <button
                                type="button"
                                className={revealButtonClasses}
                                onClick={handleRegionAction}
                                disabled={!canReveal && !canHide}
                              >
                                {revealButtonLabel}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'markers' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {sortedMarkers.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-white/60 bg-white/40 px-4 py-6 text-center text-xs uppercase tracking-[0.3em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                    No markers placed on this map.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sortedMarkers.map((marker) => {
                      const tags = parseTagList(marker.tags);
                      const iconDefinition = getMapMarkerIconDefinition(marker.iconKey);
                      const baseColor = resolveMarkerBaseColor(marker, iconDefinition);
                      const accent = getReadableMarkerColor(baseColor);
                      const isVisibleAtStart = Boolean(marker.visibleAtStart);
                      const isRevealed = isVisibleAtStart || revealedMarkersSet.has(marker.id);
                      const statusLabel = isVisibleAtStart
                        ? 'Visible at Start'
                        : isRevealed
                          ? 'Revealed'
                          : 'Hidden';
                      const statusColor = isVisibleAtStart
                        ? 'text-amber-500 dark:text-amber-300'
                        : isRevealed
                          ? 'text-emerald-500 dark:text-emerald-300'
                          : 'text-slate-500 dark:text-slate-400';
                      const canRevealMarker = Boolean(onRevealMarkers) && !isVisibleAtStart && !isRevealed;
                      const revealButtonLabel = isRevealed ? 'Already Revealed' : 'Reveal to Players';
                      const revealButtonClasses = isRevealed
                        ? 'w-full cursor-not-allowed rounded-full border border-emerald-400/50 bg-emerald-300/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200'
                        : 'w-full rounded-full border border-amber-400/70 bg-amber-300/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:bg-amber-300/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30';
                      const handleMarkerAction = () => {
                        if (!canRevealMarker) {
                          return;
                        }
                        handleRevealMarker(marker);
                      };
                      const iconElement =
                        iconDefinition &&
                        React.cloneElement(iconDefinition.icon, {
                          className: 'h-5 w-5',
                          style: { color: accent },
                        });
                      return (
                        <div
                          key={marker.id}
                          className="space-y-3 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/50"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-800 dark:text-slate-100">
                                {marker.label}
                              </p>
                              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                                {describeMarkerKind(marker)}
                              </p>
                              <p className={`text-[10px] uppercase tracking-[0.4em] ${statusColor}`}>
                                {statusLabel}
                              </p>
                            </div>
                            <span
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-900/10 text-lg shadow-inner dark:border-slate-700"
                              style={{ backgroundColor: baseColor, color: accent }}
                            >
                              {iconElement ?? '•'}
                            </span>
                          </div>
                          {marker.description && (
                            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{marker.description}</p>
                          )}
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full bg-slate-200/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-[10px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
                            <div className="flex flex-col gap-1">
                              <dt>Visible at Start</dt>
                              <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                {marker.visibleAtStart ? 'Yes' : 'No'}
                              </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                              <dt>Currently Revealed</dt>
                              <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                {isRevealed ? 'Yes' : 'No'}
                              </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                              <dt>Linked Region</dt>
                              <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                {marker.regionId ? regionNamesById.get(marker.regionId) ?? marker.regionId : '—'}
                              </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                              <dt>Horizontal</dt>
                              <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                {formatPercent(marker.x)}
                              </dd>
                            </div>
                            <div className="flex flex-col gap-1">
                              <dt>Vertical</dt>
                              <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                                {formatPercent(marker.y)}
                              </dd>
                            </div>
                          </dl>
                          {!isVisibleAtStart && (
                            <button
                              type="button"
                              className={revealButtonClasses}
                              onClick={handleMarkerAction}
                              disabled={!canRevealMarker}
                            >
                              {revealButtonLabel}
                            </button>
                          )}
                          {marker.notes && (
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">DM Notes</p>
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">{marker.notes}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {activeTab === 'other' && (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <section className="space-y-3 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/50">
                    <header>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Session Overview</p>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-800 dark:text-slate-100">{session.name}</h3>
                    </header>
                    <dl className="grid grid-cols-1 gap-3 text-[10px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center justify-between">
                        <dt>Status</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">{session.status}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>Created</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                          {formatDateTimeLabel(session.createdAt)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>Ended</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                          {formatDateTimeLabel(session.endedAt)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <section className="space-y-3 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/50">
                    <header>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Map Summary</p>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-800 dark:text-slate-100">Exploration Notes</h3>
                    </header>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-[10px] uppercase tracking-[0.35em] text-slate-500 dark:text-slate-400">
                      <div className="flex flex-col gap-1">
                        <dt>Total Rooms</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">{regions.length}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt>Visible at Start</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">{totalVisibleAtStart}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt>Revealed Now</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">{playerRevealedRegionIds.length}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt>Markers</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">{sortedMarkers.length}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt>Markers Visible</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">{totalMarkersVisibleAtStart}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt>Map Size</dt>
                        <dd className="text-xs font-semibold normal-case tracking-normal text-slate-800 dark:text-slate-100">
                          {typeof mapWidth === 'number' && typeof mapHeight === 'number'
                            ? `${mapWidth} × ${mapHeight}`
                            : 'Unknown'}
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <section className="space-y-3 rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm dark:border-slate-800/60 dark:bg-slate-900/50">
                    <header>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Session Tools</p>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-800 dark:text-slate-100">Quick Reference</h3>
                    </header>
                    <ul className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      <li>Use the Rooms tab to reveal regions in sequence as your players explore.</li>
                      <li>Keep an eye on marker visibility to surface important points of interest.</li>
                      <li>Use the session controls above to capture snapshots or end the session when the adventure wraps.</li>
                    </ul>
                  </section>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default DMSessionViewer;
