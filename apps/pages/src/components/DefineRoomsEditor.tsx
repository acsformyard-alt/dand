import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface DefineRoomDraft {
  id: string;
  name: string;
  polygon: Array<{ x: number; y: number }>;
  notes: string;
  tags: string[];
  isVisible: boolean;
}

interface DefineRoomsEditorProps {
  imageUrl: string | null;
  imageDimensions: { width: number; height: number } | null;
  rooms: DefineRoomDraft[];
  onRoomsChange: (nextRooms: DefineRoomDraft[]) => void;
}

type Point = { x: number; y: number };

type EditorTool = 'smartLasso' | 'autoWand' | 'refineBrush';

type BrushMode = 'add' | 'erase';

interface RoomAuthoringState {
  mode: 'idle' | 'editing';
  activeRoomId: string | null;
  polygon: Point[];
  previewPolygon: Point[] | null;
  samples: Point[];
  tool: EditorTool;
  brushSize: number;
  snapStrength: number;
  name: string;
  notes: string;
  tags: string[];
  isVisible: boolean;
  isDirty: boolean;
  busyMessage: string | null;
}

type RoomAuthoringListener = (state: RoomAuthoringState) => void;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `room-${Math.random().toString(36).slice(2, 10)}`;
};

const distance = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const dedupePoints = (points: Point[]) => {
  const seen = new Set<string>();
  const result: Point[] = [];
  for (const point of points) {
    const key = `${point.x.toFixed(4)}:${point.y.toFixed(4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(point);
    }
  }
  return result;
};

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

const computeHull = (input: Point[]) => {
  const points = dedupePoints(input).sort((p1, p2) => (p1.x === p2.x ? p1.y - p2.y : p1.x - p2.x));
  if (points.length <= 3) {
    return points.slice();
  }
  const lower: Point[] = [];
  for (const point of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Point[] = [];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

const generateCircularPolygon = (center: Point, radius: number, steps = 16): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: clamp(center.x + Math.cos(angle) * radius, 0, 1),
      y: clamp(center.y + Math.sin(angle) * radius, 0, 1),
    });
  }
  return points;
};

const strokeToSamples = (stroke: Point[], snapStrength: number) => {
  if (stroke.length === 0) return [];
  const step = Math.max(1, Math.round(12 - snapStrength * 8));
  const sampled: Point[] = [];
  for (let index = 0; index < stroke.length; index += step) {
    sampled.push(stroke[index]);
  }
  if (sampled[sampled.length - 1] !== stroke[stroke.length - 1]) {
    sampled.push(stroke[stroke.length - 1]);
  }
  return sampled;
};

class SegmentationService {
  private imageSize: { width: number; height: number } | null;

  constructor(imageSize: { width: number; height: number } | null) {
    this.imageSize = imageSize;
  }

  setImageSize(size: { width: number; height: number } | null) {
    this.imageSize = size;
  }

  snapPoint(point: Point, snapStrength: number): Point {
    if (!this.imageSize) {
      return { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
    }
    const resolution = clamp(Math.round(12 + snapStrength * 20), 6, 48);
    return {
      x: clamp(Math.round(point.x * resolution) / resolution, 0, 1),
      y: clamp(Math.round(point.y * resolution) / resolution, 0, 1),
    };
  }

  smoothStroke(path: Point[], snapStrength: number) {
    const sampled = strokeToSamples(path, snapStrength);
    const snapped = sampled.map((point) => this.snapPoint(point, snapStrength));
    return computeHull(snapped);
  }

  async wandSelect(point: Point, brushSize: number, snapStrength: number): Promise<Point[]> {
    const radius = clamp(brushSize * 1.25, 0.02, 0.45);
    const basePolygon = generateCircularPolygon(point, radius, 18);
    const snapped = basePolygon.map((vertex) => this.snapPoint(vertex, snapStrength));
    await new Promise((resolve) => setTimeout(resolve, 120));
    return computeHull([...snapped, this.snapPoint(point, snapStrength)]);
  }
}

const buildDefaultState = (): RoomAuthoringState => ({
  mode: 'idle',
  activeRoomId: null,
  polygon: [],
  previewPolygon: null,
  samples: [],
  tool: 'smartLasso',
  brushSize: 0.08,
  snapStrength: 0.65,
  name: '',
  notes: '',
  tags: [],
  isVisible: true,
  isDirty: false,
  busyMessage: null,
});

class RoomAuthoringStore {
  private state: RoomAuthoringState = buildDefaultState();

  private listeners = new Set<RoomAuthoringListener>();

  constructor(private segmentation: SegmentationService) {}

  getState() {
    return this.state;
  }

  subscribe(listener: RoomAuthoringListener) {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(updater: (state: RoomAuthoringState) => RoomAuthoringState) {
    this.state = updater(this.state);
    this.listeners.forEach((listener) => listener(this.state));
  }

  setTool(tool: EditorTool) {
    this.setState((current) => ({ ...current, tool }));
  }

  setBrushSize(size: number) {
    this.setState((current) => ({ ...current, brushSize: clamp(size, 0.02, 0.5) }));
  }

  setSnapStrength(value: number) {
    this.setState((current) => ({ ...current, snapStrength: clamp(value, 0, 1) }));
  }

  setName(name: string) {
    this.setState((current) => ({ ...current, name, isDirty: true }));
  }

  setNotes(notes: string) {
    this.setState((current) => ({ ...current, notes, isDirty: true }));
  }

  setTags(tags: string[]) {
    this.setState((current) => ({ ...current, tags, isDirty: true }));
  }

  setVisibility(visible: boolean) {
    this.setState((current) => ({ ...current, isVisible: visible, isDirty: true }));
  }

  setBusy(message: string | null) {
    this.setState((current) => ({ ...current, busyMessage: message }));
  }

  previewPolygon(polygon: Point[] | null) {
    this.setState((current) => ({ ...current, previewPolygon: polygon }));
  }

  commitPolygon(polygon: Point[]) {
    const samples = polygon.length ? polygon.slice() : [];
    this.setState((current) => ({
      ...current,
      polygon,
      samples,
      previewPolygon: null,
      isDirty: true,
    }));
  }

  updateSamples(samples: Point[]) {
    const polygon = samples.length ? computeHull(samples) : [];
    this.setState((current) => ({
      ...current,
      samples,
      polygon,
      previewPolygon: null,
      isDirty: true,
    }));
  }

  reset() {
    this.setState(() => buildDefaultState());
  }

  startNewRoom(suggestedName: string) {
    this.setState(() => ({
      ...buildDefaultState(),
      mode: 'editing',
      activeRoomId: createDraftId(),
      name: suggestedName,
      isVisible: true,
    }));
  }

  startFromRoom(room: DefineRoomDraft) {
    this.setState(() => ({
      mode: 'editing',
      activeRoomId: room.id,
      polygon: room.polygon.slice(),
      previewPolygon: null,
      samples: room.polygon.slice(),
      tool: 'smartLasso',
      brushSize: 0.08,
      snapStrength: 0.65,
      name: room.name,
      notes: room.notes,
      tags: room.tags,
      isVisible: room.isVisible,
      isDirty: false,
      busyMessage: null,
    }));
  }

  finish(): DefineRoomDraft | null {
    const current = this.state;
    if (!current.activeRoomId || current.polygon.length < 3) {
      return null;
    }
    return {
      id: current.activeRoomId,
      name: current.name || 'Untitled Room',
      polygon: current.polygon.map((point) => ({ x: point.x, y: point.y })),
      notes: current.notes,
      tags: current.tags,
      isVisible: current.isVisible,
    };
  }
}

class SmartLassoModule {
  private stroke: Point[] = [];

  constructor(private store: RoomAuthoringStore, private segmentation: SegmentationService) {}

  begin(point: Point) {
    this.stroke = [point];
    const state = this.store.getState();
    const preview = this.segmentation.smoothStroke(this.stroke, state.snapStrength);
    this.store.previewPolygon(preview);
  }

  update(point: Point) {
    this.stroke.push(point);
    const state = this.store.getState();
    const preview = this.segmentation.smoothStroke(this.stroke, state.snapStrength);
    this.store.previewPolygon(preview);
  }

  complete() {
    if (this.stroke.length < 3) {
      this.store.previewPolygon(null);
      this.stroke = [];
      return;
    }
    const state = this.store.getState();
    const polygon = this.segmentation.smoothStroke(this.stroke, state.snapStrength);
    this.store.commitPolygon(polygon);
    this.stroke = [];
  }
}

class AutoWandModule {
  private active = false;

  constructor(private store: RoomAuthoringStore, private segmentation: SegmentationService) {}

  async select(point: Point) {
    if (this.active) return;
    this.active = true;
    const state = this.store.getState();
    this.store.setBusy('Analyzing region…');
    try {
      const polygon = await this.segmentation.wandSelect(point, state.brushSize, state.snapStrength);
      this.store.commitPolygon(polygon);
    } finally {
      this.store.setBusy(null);
      this.active = false;
    }
  }
}

class BrushRefinementModule {
  constructor(private store: RoomAuthoringStore, private segmentation: SegmentationService) {}

  apply(point: Point, mode: BrushMode) {
    const state = this.store.getState();
    const snappedCenter = this.segmentation.snapPoint(point, state.snapStrength);
    const radius = clamp(state.brushSize, 0.02, 0.4);
    const samples = [...state.samples];
    if (mode === 'add') {
      const ring = generateCircularPolygon(snappedCenter, radius, 12);
      this.store.updateSamples([...samples, snappedCenter, ...ring]);
    } else {
      const filtered = samples.filter((sample) => distance(sample, snappedCenter) > radius * 0.6);
      this.store.updateSamples(filtered);
    }
  }
}

interface AuthoringCoordinator {
  store: RoomAuthoringStore;
  smartLasso: SmartLassoModule;
  autoWand: AutoWandModule;
  brush: BrushRefinementModule;
  segmentation: SegmentationService;
}

const useAuthoringCoordinator = (imageDimensions: { width: number; height: number } | null) => {
  const coordinatorRef = useRef<AuthoringCoordinator | null>(null);
  if (!coordinatorRef.current) {
    const segmentation = new SegmentationService(imageDimensions);
    const store = new RoomAuthoringStore(segmentation);
    coordinatorRef.current = {
      store,
      smartLasso: new SmartLassoModule(store, segmentation),
      autoWand: new AutoWandModule(store, segmentation),
      brush: new BrushRefinementModule(store, segmentation),
      segmentation,
    };
  } else {
    coordinatorRef.current.segmentation.setImageSize(imageDimensions);
  }
  return coordinatorRef.current;
};

interface ViewportMetrics {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

const computeViewportMetrics = (
  container: HTMLDivElement | null,
  image: HTMLImageElement | null
): ViewportMetrics | null => {
  if (!container || !image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  const containerRatio = rect.width / rect.height;
  const imageRatio = image.naturalWidth / image.naturalHeight;
  let width = rect.width;
  let height = rect.height;
  if (imageRatio > containerRatio) {
    width = rect.width;
    height = width / imageRatio;
  } else {
    height = rect.height;
    width = height * imageRatio;
  }
  const offsetX = (rect.width - width) / 2;
  const offsetY = (rect.height - height) / 2;
  return { width, height, offsetX, offsetY };
};

const pointFromEvent = (event: PointerEvent, metrics: ViewportMetrics | null, container: HTMLDivElement | null): Point | null => {
  if (!metrics || !container) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  const x = (event.clientX - rect.left - metrics.offsetX) / metrics.width;
  const y = (event.clientY - rect.top - metrics.offsetY) / metrics.height;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
};

const polygonToAttribute = (polygon: Point[], metrics: ViewportMetrics | null) => {
  if (!metrics || polygon.length === 0) {
    return '';
  }
  return polygon
    .map((point) => `${(point.x * metrics.width).toFixed(2)},${(point.y * metrics.height).toFixed(2)}`)
    .join(' ');
};

const DefineRoomsEditor: React.FC<DefineRoomsEditorProps> = ({
  imageUrl,
  imageDimensions,
  rooms,
  onRoomsChange,
}) => {
  const coordinator = useAuthoringCoordinator(imageDimensions);
  const [authoringState, setAuthoringState] = useState<RoomAuthoringState>(coordinator.store.getState());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [metrics, setMetrics] = useState<ViewportMetrics | null>(null);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const brushModeRef = useRef<BrushMode | null>(null);
  const pointerToolRef = useRef<EditorTool | null>(null);

  useEffect(() => coordinator.store.subscribe(setAuthoringState), [coordinator]);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(computeViewportMetrics(containerRef.current, imageRef.current));
    };
    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => {
      observer.disconnect();
    };
  }, [imageUrl]);

  const handleAddRoom = () => {
    const nextIndex = rooms.length + 1;
    coordinator.store.startNewRoom(`Room ${nextIndex}`);
  };

  const handleFinishRoom = () => {
    const draft = coordinator.store.finish();
    if (!draft) {
      return;
    }
    const existingIndex = rooms.findIndex((room) => room.id === draft.id);
    const nextRooms = [...rooms];
    if (existingIndex >= 0) {
      nextRooms[existingIndex] = { ...nextRooms[existingIndex], ...draft };
    } else {
      nextRooms.push(draft);
    }
    onRoomsChange(nextRooms);
    coordinator.store.reset();
  };

  const handleCancelEditing = () => {
    coordinator.store.reset();
  };

  const handleEditRoom = (room: DefineRoomDraft) => {
    coordinator.store.startFromRoom(room);
  };

  const handleDeleteRoom = (roomId: string) => {
    const nextRooms = rooms.filter((room) => room.id !== roomId);
    onRoomsChange(nextRooms);
    if (authoringState.activeRoomId === roomId) {
      coordinator.store.reset();
    }
  };

  const handleToggleVisibility = (room: DefineRoomDraft) => {
    const nextRooms = rooms.map((existing) =>
      existing.id === room.id ? { ...existing, isVisible: !existing.isVisible } : existing
    );
    onRoomsChange(nextRooms);
    if (authoringState.activeRoomId === room.id) {
      coordinator.store.setVisibility(!room.isVisible);
    }
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!metrics || authoringState.mode !== 'editing') {
      return;
    }
    const point = pointFromEvent(event.nativeEvent, metrics, containerRef.current);
    if (!point) {
      return;
    }
    pointerToolRef.current = authoringState.tool;
    if (authoringState.tool === 'smartLasso') {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      coordinator.smartLasso.begin(point);
      setIsPointerDown(true);
    } else if (authoringState.tool === 'autoWand') {
      event.preventDefault();
      coordinator.autoWand.select(point);
    } else if (authoringState.tool === 'refineBrush') {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const mode: BrushMode = event.button === 2 ? 'add' : 'erase';
      brushModeRef.current = mode;
      coordinator.brush.apply(point, mode);
      setIsPointerDown(true);
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!metrics || !isPointerDown || authoringState.mode !== 'editing') {
      return;
    }
    const point = pointFromEvent(event.nativeEvent, metrics, containerRef.current);
    if (!point || !pointerToolRef.current) {
      return;
    }
    if (pointerToolRef.current === 'smartLasso') {
      coordinator.smartLasso.update(point);
    } else if (pointerToolRef.current === 'refineBrush' && brushModeRef.current) {
      coordinator.brush.apply(point, brushModeRef.current);
    }
  };

  const endPointerInteraction = () => {
    if (pointerToolRef.current === 'smartLasso') {
      coordinator.smartLasso.complete();
    }
    setIsPointerDown(false);
    brushModeRef.current = null;
    pointerToolRef.current = null;
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDown) {
      return;
    }
    event.preventDefault();
    event.currentTarget.releasePointerCapture(event.pointerId);
    endPointerInteraction();
  };

  const onPointerLeave = () => {
    if (!isPointerDown) {
      return;
    }
    endPointerInteraction();
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (authoringState.mode === 'editing') {
      event.preventDefault();
    }
  };

  const polygonPath = useMemo(() => polygonToAttribute(authoringState.polygon, metrics), [authoringState.polygon, metrics]);
  const previewPath = useMemo(
    () => polygonToAttribute(authoringState.previewPolygon ?? [], metrics),
    [authoringState.previewPolygon, metrics]
  );

  const canFinish = authoringState.mode === 'editing' && authoringState.polygon.length >= 3;

  if (!imageUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Upload a map image to start outlining rooms.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800/70 bg-slate-950/70 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-teal-300">Define Rooms</p>
          <p className="mt-1 text-sm text-slate-300">
            Trace a room with Smart Lasso, click with Auto Wand, then refine edges with the brush. Right click adds area, left
            click erases.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {authoringState.mode === 'editing' ? (
            <>
              <button
                type="button"
                onClick={handleCancelEditing}
                className="rounded-full border border-slate-700 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinishRoom}
                disabled={!canFinish}
                className={`rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                  canFinish
                    ? 'border border-teal-400/70 bg-teal-500/80 text-slate-900 hover:bg-teal-400/90'
                    : 'border border-slate-700 bg-slate-800/60 text-slate-500'
                }`}
              >
                Finish Room
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleAddRoom}
              className="rounded-full border border-teal-400/60 bg-teal-500/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
            >
              Add Room
            </button>
          )}
        </div>
      </div>
      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="relative flex min-h-[420px] flex-col rounded-3xl border border-slate-800/70 bg-slate-950/70">
          <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden rounded-3xl">
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Map editor"
              onLoad={() => setMetrics(computeViewportMetrics(containerRef.current, imageRef.current))}
              className="pointer-events-none h-full w-full select-none object-contain"
            />
            {metrics && (
              <svg
                role="presentation"
                className="absolute inset-0"
                style={{
                  left: metrics.offsetX,
                  top: metrics.offsetY,
                  width: metrics.width,
                  height: metrics.height,
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerLeave}
                onContextMenu={handleContextMenu}
              >
                <rect x={0} y={0} width={metrics.width} height={metrics.height} fill="transparent" />
                {previewPath && (
                  <polygon points={previewPath} fill="rgba(45,212,191,0.3)" stroke="rgba(45,212,191,0.6)" strokeWidth={2} />
                )}
                {polygonPath && (
                  <polygon points={polygonPath} fill="rgba(59,130,246,0.2)" stroke="rgba(96,165,250,0.85)" strokeWidth={2} />
                )}
                {rooms.map((room) => {
                  if (!room.isVisible || room.id === authoringState.activeRoomId) {
                    return null;
                  }
                  const overlay = polygonToAttribute(room.polygon, metrics);
                  if (!overlay) return null;
                  return (
                    <polygon
                      key={room.id}
                      points={overlay}
                      fill="rgba(148,163,184,0.14)"
                      stroke="rgba(148,163,184,0.5)"
                      strokeWidth={1.5}
                    />
                  );
                })}
              </svg>
            )}
          </div>
          <div className="border-t border-slate-800/70 px-5 py-3 text-xs text-slate-400">
            {authoringState.mode === 'editing' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  Active tool:
                  <span className="ml-2 rounded-full border border-slate-700 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-200">
                    {authoringState.tool === 'smartLasso'
                      ? 'Smart Lasso'
                      : authoringState.tool === 'autoWand'
                      ? 'Auto Wand'
                      : 'Refine Brush'}
                  </span>
                </span>
                <span className="text-slate-500">
                  {authoringState.busyMessage || 'Right click to add, left click to erase when using the brush.'}
                </span>
              </div>
            ) : (
              <span>Select an existing room or start a new one to begin outlining areas.</span>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Tools</p>
                <h3 className="text-lg font-semibold text-white">Vector Authoring</h3>
              </div>
              <div className="text-right text-[10px] uppercase tracking-[0.35em] text-slate-500">
                Snap {Math.round(authoringState.snapStrength * 100)}%
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => coordinator.store.setTool('smartLasso')}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  authoringState.tool === 'smartLasso'
                    ? 'bg-indigo-500/80 text-white shadow'
                    : 'border border-slate-800 bg-slate-900/70 text-slate-200 hover:border-slate-600 hover:text-white'
                }`}
              >
                Smart Lasso
              </button>
              <button
                type="button"
                onClick={() => coordinator.store.setTool('autoWand')}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  authoringState.tool === 'autoWand'
                    ? 'bg-indigo-500/80 text-white shadow'
                    : 'border border-slate-800 bg-slate-900/70 text-slate-200 hover:border-slate-600 hover:text-white'
                }`}
              >
                Auto Wand
              </button>
              <button
                type="button"
                onClick={() => coordinator.store.setTool('refineBrush')}
                className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  authoringState.tool === 'refineBrush'
                    ? 'bg-indigo-500/80 text-white shadow'
                    : 'border border-slate-800 bg-slate-900/70 text-slate-200 hover:border-slate-600 hover:text-white'
                }`}
              >
                Refine Brush
              </button>
            </div>
            <div className="mt-5 space-y-4 text-sm text-slate-200">
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Brush Size</span>
                <input
                  type="range"
                  min={0.02}
                  max={0.3}
                  step={0.01}
                  value={authoringState.brushSize}
                  onChange={(event) => coordinator.store.setBrushSize(parseFloat(event.currentTarget.value))}
                />
                <span className="text-xs text-slate-500">Current radius: {(authoringState.brushSize * 100).toFixed(0)}% of the image width.</span>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Snap to Wall Strength</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={authoringState.snapStrength}
                  onChange={(event) => coordinator.store.setSnapStrength(parseFloat(event.currentTarget.value))}
                />
                <span className="text-xs text-slate-500">
                  Higher values pull points toward nearby orthogonal edges detected in the segmentation pyramid.
                </span>
              </label>
            </div>
          </div>
          <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Room Metadata</p>
            {authoringState.mode === 'editing' ? (
              <div className="mt-4 space-y-4">
                <label className="block text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Name</span>
                  <input
                    type="text"
                    value={authoringState.name}
                    onChange={(event) => coordinator.store.setName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                    placeholder="Great Hall"
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Notes</span>
                  <textarea
                    value={authoringState.notes}
                    onChange={(event) => coordinator.store.setNotes(event.target.value)}
                    className="mt-2 min-h-[96px] w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                    placeholder="Secret door in the northwest corner"
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Tags</span>
                  <input
                    type="text"
                    value={authoringState.tags.join(', ')}
                    onChange={(event) =>
                      coordinator.store.setTags(
                        event.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean)
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                    placeholder="entrance, danger"
                  />
                </label>
                <label className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-slate-400">
                  <input
                    type="checkbox"
                    checked={authoringState.isVisible}
                    onChange={(event) => coordinator.store.setVisibility(event.currentTarget.checked)}
                    className="h-4 w-4 rounded border border-slate-700 bg-slate-900"
                  />
                  Include room in reveal flow
                </label>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">
                Start a room to record its name, notes, and reveal tags. Finishing the room will commit both the geometry and
                metadata.
              </p>
            )}
          </div>
          <div className="flex-1 min-h-0 rounded-3xl border border-slate-800/70 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Rooms</p>
                <h3 className="text-lg font-semibold text-white">Draft List</h3>
              </div>
              <span className="text-xs text-slate-500">{rooms.length} total</span>
            </div>
            <div className="mt-4 flex h-[260px] flex-col gap-3 overflow-y-auto pr-1 text-sm">
              {rooms.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-800/70 bg-slate-900/60 p-6 text-center text-xs text-slate-500">
                  Rooms you outline will appear here for quick editing and ordering.
                </div>
              ) : (
                rooms.map((room) => {
                  const isActive = authoringState.activeRoomId === room.id;
                  return (
                    <div
                      key={room.id}
                      className={`rounded-2xl border px-4 py-3 transition ${
                        isActive ? 'border-teal-400/70 bg-slate-950/80' : 'border-slate-800/70 bg-slate-950/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{room.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{room.polygon.length} points · {room.tags.join(', ') || 'No tags'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(room)}
                            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                              room.isVisible
                                ? 'border-emerald-400/70 text-emerald-200 hover:bg-emerald-400/10'
                                : 'border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                          >
                            {room.isVisible ? 'Visible' : 'Hidden'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditRoom(room)}
                            className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-teal-400/70 hover:text-teal-100"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoom(room.id)}
                            className="rounded-full border border-rose-500/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/20"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefineRoomsEditor;
