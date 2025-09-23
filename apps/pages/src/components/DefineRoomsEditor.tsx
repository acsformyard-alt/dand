import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomMaskManifestEntry } from '../types';
import type { Point } from '../types/geometry';
import { cloneRoomMask, encodeRoomMaskToDataUrl, roomMaskToPolygon, type RoomMask } from '../utils/roomMask';
import { createEmptySelectionState, type SelectionState } from '../state/selection';
import { defineRoomsStore } from '../state/defineRoomsStore';
import { createAutoWandTool } from '../tools/defineRooms/AutoWandTool';
import { createLassoTool } from '../tools/defineRooms/LassoTool';
import { createPaintbrushTool } from '../tools/defineRooms/PaintbrushTool';
import { createSmartLassoTool } from '../tools/defineRooms/SmartLassoTool';
import type { DefineRoomsTool, PointerState, RasterContext, ToolContext } from '../tools/defineRooms/ToolContext';

export interface DefineRoomDraft {
  id: string;
  name: string;
  mask: RoomMask;
  maskManifest: RoomMaskManifestEntry;
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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const createDraftId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `room-${Math.random().toString(36).slice(2, 10)}`;
};

interface EditingDraft {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  isVisible: boolean;
  isDirty: boolean;
}

type ToolId = NonNullable<SelectionState['tool']>;

const clampPoint = (point: Point): Point => ({
  x: clamp(point.x, 0, 1),
  y: clamp(point.y, 0, 1),
});

const snapPoint = (point: Point, snapStrength: number): Point => {
  const resolution = clamp(Math.round(12 + snapStrength * 20), 6, 48);
  return {
    x: clamp(Math.round(point.x * resolution) / resolution, 0, 1),
    y: clamp(Math.round(point.y * resolution) / resolution, 0, 1),
  };
};

const toPointerState = (event: React.PointerEvent<SVGSVGElement>, point: Point): PointerState => ({
  point,
  button: event.button,
  buttons: event.buttons,
  pressure: event.pressure,
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  metaKey: event.metaKey,
  shiftKey: event.shiftKey,
});

const rasterFromImage = (image: HTMLImageElement | null): RasterContext | null => {
  if (!image || !image.complete || !image.naturalWidth || !image.naturalHeight) {
    return null;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      layers: new Uint8ClampedArray(data.data),
      width: canvas.width,
      height: canvas.height,
    };
  } catch (error) {
    return null;
  }
};

const defaultTool: ToolId = 'smartLasso';

const createToolRegistry = (): Record<ToolId, DefineRoomsTool> => ({
  paintbrush: createPaintbrushTool(),
  lasso: createLassoTool(),
  smartLasso: createSmartLassoTool(),
  autoWand: createAutoWandTool(),
});

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

const pointFromEvent = (
  event: PointerEvent,
  metrics: ViewportMetrics | null,
  container: HTMLDivElement | null,
  zoomLevel: number
): Point | null => {
  if (!metrics || !container) {
    return null;
  }
  const rect = container.getBoundingClientRect();
  const scaledWidth = metrics.width * zoomLevel;
  const scaledHeight = metrics.height * zoomLevel;
  const offsetX = metrics.offsetX - (scaledWidth - metrics.width) / 2;
  const offsetY = metrics.offsetY - (scaledHeight - metrics.height) / 2;
  const x = (event.clientX - rect.left - offsetX) / scaledWidth;
  const y = (event.clientY - rect.top - offsetY) / scaledHeight;
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
  rooms,
  onRoomsChange,
}) => {
  const [defineState, setDefineState] = useState(defineRoomsStore.getState());
  const [draft, setDraft] = useState<EditingDraft | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [metrics, setMetrics] = useState<ViewportMetrics | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [raster, setRaster] = useState<RasterContext | null>(null);
  const toolRegistryRef = useRef(createToolRegistry());
  const toolContextRef = useRef<ToolContext>({
    store: defineRoomsStore,
    segmentation: null,
    raster: null,
    snap: (point: Point) => clampPoint(point),
    clamp: clampPoint,
  });
  const activeToolRef = useRef<DefineRoomsTool | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => defineRoomsStore.subscribe(setDefineState), []);

  useEffect(() => {
    toolContextRef.current = {
      store: defineRoomsStore,
      segmentation: null,
      raster,
      snap: (point: Point) => snapPoint(point, defineState.selection.snapStrength),
      clamp: clampPoint,
    };
  }, [defineState.selection.snapStrength, raster]);

  const refreshViewport = useCallback(() => {
    setMetrics(computeViewportMetrics(containerRef.current, imageRef.current));
    setRaster(rasterFromImage(imageRef.current));
  }, []);

  useEffect(() => {
    refreshViewport();
    const observer = new ResizeObserver(refreshViewport);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => {
      observer.disconnect();
    };
  }, [refreshViewport, imageUrl]);

  const updateSelection = useCallback((updater: (selection: SelectionState) => SelectionState) => {
    const current = defineRoomsStore.getState().selection;
    const next = updater({ ...current });
    defineRoomsStore.setSelection(next);
  }, []);

  const startEditing = useCallback(
    (nextDraft: EditingDraft, mask: RoomMask | null) => {
      defineRoomsStore.clear();
      const baseSelection = {
        ...createEmptySelectionState(),
        tool: defaultTool,
        mask: mask ? cloneRoomMask(mask) : null,
      };
      defineRoomsStore.setMode('editing');
      defineRoomsStore.setSelection(baseSelection);
      defineRoomsStore.setTool(defaultTool);
      defineRoomsStore.previewMask(null);
      defineRoomsStore.setBusy(null);
      setDraft(nextDraft);
    },
    [setDraft]
  );

  const handleAddRoom = () => {
    const nextIndex = rooms.length + 1;
    startEditing(
      {
        id: createDraftId(),
        name: `Room ${nextIndex}`,
        notes: '',
        tags: [],
        isVisible: true,
        isDirty: false,
      },
      null
    );
  };

  const handleFinishRoom = () => {
    if (!draft) {
      return;
    }
    const current = defineRoomsStore.getState();
    if (!current.selection.mask) {
      return;
    }
    const mask = cloneRoomMask(current.selection.mask);
    const finalized: DefineRoomDraft = {
      id: draft.id,
      name: draft.name.trim() || 'Untitled Room',
      mask,
      maskManifest: {
        roomId: draft.id,
        key: `room-masks/${draft.id}.png`,
        dataUrl: encodeRoomMaskToDataUrl(mask),
      },
      notes: draft.notes,
      tags: draft.tags,
      isVisible: draft.isVisible,
    };
    const existingIndex = rooms.findIndex((room) => room.id === finalized.id);
    const nextRooms = [...rooms];
    if (existingIndex >= 0) {
      nextRooms[existingIndex] = { ...nextRooms[existingIndex], ...finalized };
    } else {
      nextRooms.push(finalized);
    }
    onRoomsChange(nextRooms);
    setDraft(null);
    defineRoomsStore.clear();
  };

  const handleCancelEditing = () => {
    setDraft(null);
    defineRoomsStore.clear();
  };

  const handleEditRoom = (room: DefineRoomDraft) => {
    startEditing(
      {
        id: room.id,
        name: room.name,
        notes: room.notes,
        tags: room.tags.slice(),
        isVisible: room.isVisible,
        isDirty: false,
      },
      room.mask
    );
  };

  const handleDeleteRoom = (roomId: string) => {
    const nextRooms = rooms.filter((room) => room.id !== roomId);
    onRoomsChange(nextRooms);
    if (draft?.id === roomId) {
      setDraft(null);
      defineRoomsStore.clear();
    }
  };

  const handleToggleVisibility = (room: DefineRoomDraft) => {
    const nextRooms = rooms.map((existing) =>
      existing.id === room.id ? { ...existing, isVisible: !existing.isVisible } : existing
    );
    onRoomsChange(nextRooms);
    if (draft?.id === room.id) {
      setDraft((current) =>
        current ? { ...current, isVisible: !room.isVisible, isDirty: true } : current
      );
    }
  };

  const handleZoomToggle = () => {
    setZoomLevel((current) => {
      const next = current >= 2 ? 1 : parseFloat((current + 0.25).toFixed(2));
      return next;
    });
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!metrics || defineState.mode !== 'editing') {
      return;
    }
    const point = pointFromEvent(event.nativeEvent, metrics, containerRef.current, zoomLevel);
    if (!point) {
      return;
    }
    const toolId = defineState.selection.tool ?? defaultTool;
    const tool = toolRegistryRef.current[toolId];
    if (!tool) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    activeToolRef.current = tool;
    setIsPointerDown(true);
    tool.onPointerDown(toolContextRef.current, toPointerState(event, point));
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!metrics || !isPointerDown || defineState.mode !== 'editing') {
      return;
    }
    const tool = activeToolRef.current;
    if (!tool) {
      return;
    }
    const point = pointFromEvent(event.nativeEvent, metrics, containerRef.current, zoomLevel);
    if (!point) {
      return;
    }
    tool.onPointerMove(toolContextRef.current, toPointerState(event, point));
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDown) {
      return;
    }
    const tool = activeToolRef.current;
    const point = metrics
      ? pointFromEvent(event.nativeEvent, metrics, containerRef.current, zoomLevel)
      : null;
    if (tool && point) {
      tool.onPointerUp(toolContextRef.current, toPointerState(event, point));
    } else if (tool?.onCancel) {
      tool.onCancel(toolContextRef.current);
    }
    if (pointerIdRef.current !== null) {
      event.currentTarget.releasePointerCapture(pointerIdRef.current);
      pointerIdRef.current = null;
    }
    activeToolRef.current = null;
    setIsPointerDown(false);
  };

  const onPointerLeave = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDown) {
      return;
    }
    const tool = activeToolRef.current;
    if (tool?.onCancel) {
      tool.onCancel(toolContextRef.current);
    }
    if (pointerIdRef.current !== null) {
      event.currentTarget.releasePointerCapture(pointerIdRef.current);
      pointerIdRef.current = null;
    }
    activeToolRef.current = null;
    setIsPointerDown(false);
  };

  const onPointerCancel = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isPointerDown) {
      return;
    }
    const tool = activeToolRef.current;
    if (tool?.onCancel) {
      tool.onCancel(toolContextRef.current);
    }
    if (pointerIdRef.current !== null) {
      event.currentTarget.releasePointerCapture(pointerIdRef.current);
      pointerIdRef.current = null;
    }
    activeToolRef.current = null;
    setIsPointerDown(false);
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (defineState.mode === 'editing') {
      event.preventDefault();
    }
  };

  const activeToolId = defineState.selection.tool ?? defaultTool;
  const activePolygon = useMemo(
    () => (defineState.selection.mask ? roomMaskToPolygon(defineState.selection.mask) : []),
    [defineState.selection.mask]
  );
  const polygonPath = useMemo(() => polygonToAttribute(activePolygon, metrics), [activePolygon, metrics]);
  const previewPolygonPoints = useMemo(
    () => (defineState.previewMask ? roomMaskToPolygon(defineState.previewMask) : []),
    [defineState.previewMask]
  );
  const previewPath = useMemo(() => polygonToAttribute(previewPolygonPoints, metrics), [previewPolygonPoints, metrics]);

  const canFinish = defineState.mode === 'editing' && draft && activePolygon.length >= 3;
  const zoomDisplay = Math.round(zoomLevel * 100);
  const toolLabel =
    activeToolId === 'smartLasso'
      ? 'Smart Lasso'
      : activeToolId === 'autoWand'
      ? 'Magic Wand'
      : activeToolId === 'lasso'
      ? 'Lasso'
      : 'Paintbrush';

  const toolButtonClasses = (active: boolean) =>
    `flex h-12 w-12 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-teal-400/60 focus:ring-offset-0 ${
      active
        ? 'border-teal-400/70 bg-teal-500/20 text-teal-200 shadow-[0_0_14px_rgba(45,212,191,0.25)]'
        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-600 hover:text-white'
    }`;

  const addRoomButtonClasses = `flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-teal-400/60 focus:ring-offset-0 ${
    defineState.mode === 'editing'
      ? canFinish
        ? 'bg-emerald-500 hover:bg-emerald-400'
        : 'bg-emerald-500/50 cursor-not-allowed opacity-60'
      : 'bg-blue-500 hover:bg-blue-400'
  }`;

  const renderToolSettings = () => {
    const selection = defineState.selection;
    if (activeToolId === 'paintbrush') {
      return (
        <>
          <div className="h-px w-full border-b border-slate-800/70" />
          <div className="w-full px-2 text-center">
            <label className="flex flex-col items-center text-[10px] uppercase tracking-[0.35em] text-slate-500">
              Brush Radius
              <input
                type="range"
                min={0.02}
                max={0.4}
                step={0.01}
                value={selection.brushRadius}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    brushRadius: clamp(Number(event.currentTarget.value), 0.02, 0.4),
                  }))
                }
                className="mt-2 w-full"
                aria-label="Brush Radius"
              />
            </label>
            <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-slate-500">
              Current radius: {Math.round(selection.brushRadius * 100)}% of the image width
            </p>
            <label className="mt-4 flex flex-col items-center text-[10px] uppercase tracking-[0.35em] text-slate-500">
              Hardness
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selection.brushHardness}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    brushHardness: clamp(Number(event.currentTarget.value), 0, 1),
                  }))
                }
                className="mt-2 w-full"
                aria-label="Brush Hardness"
              />
            </label>
            <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-slate-500">
              Hardness: {Math.round(selection.brushHardness * 100)}%
            </p>
          </div>
        </>
      );
    }

    if (activeToolId === 'autoWand') {
      return (
        <>
          <div className="h-px w-full border-b border-slate-800/70" />
          <div className="flex w-full flex-col gap-3 px-3 py-2 text-xs text-slate-400">
            <label className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Tolerance
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={selection.wandTolerance}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    wandTolerance: clamp(Number(event.currentTarget.value), 0, 1),
                  }))
                }
                aria-label="Wand Tolerance"
              />
            </label>
            <p className="-mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              {Math.round(selection.wandTolerance * 100)}% threshold
            </p>
            <label className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Feather
              <input
                type="range"
                min={0}
                max={0.05}
                step={0.005}
                value={selection.selectionFeather}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    selectionFeather: clamp(Number(event.currentTarget.value), 0, 0.25),
                  }))
                }
                aria-label="Selection Feather"
              />
            </label>
            <p className="-mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Feather radius: {(selection.selectionFeather * 100).toFixed(1)}% of mask size
            </p>
            <label className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Edge Width
              <input
                type="range"
                min={0.005}
                max={0.08}
                step={0.005}
                value={selection.edgeRefinementWidth}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    edgeRefinementWidth: clamp(Number(event.currentTarget.value), 0.005, 0.25),
                  }))
                }
                aria-label="Edge Width"
              />
            </label>
            <p className="-mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Edge band: {(selection.edgeRefinementWidth * 100).toFixed(1)}%
            </p>
            <div className="flex flex-col gap-2">
              <label className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-[11px] font-medium text-slate-200">
                <span>Contiguous</span>
                <input
                  type="checkbox"
                  checked={selection.wandContiguous}
                  onChange={(event) =>
                    updateSelection((current) => ({
                      ...current,
                      wandContiguous: event.currentTarget.checked,
                    }))
                  }
                  aria-label="Contiguous Selection"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-[11px] font-medium text-slate-200">
                <span>Sample all layers</span>
                <input
                  type="checkbox"
                  checked={selection.wandSampleAllLayers}
                  onChange={(event) =>
                    updateSelection((current) => ({
                      ...current,
                      wandSampleAllLayers: event.currentTarget.checked,
                    }))
                  }
                  aria-label="Sample All Layers"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-[11px] font-medium text-slate-200">
                <span>Anti-alias</span>
                <input
                  type="checkbox"
                  checked={selection.wandAntiAlias}
                  onChange={(event) =>
                    updateSelection((current) => ({
                      ...current,
                      wandAntiAlias: event.currentTarget.checked,
                    }))
                  }
                  aria-label="Anti Alias"
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-[11px] font-medium text-slate-200">
                <span>+5px dilation</span>
                <input
                  type="checkbox"
                  checked={selection.dilateBy5px}
                  onChange={(event) =>
                    updateSelection((current) => ({
                      ...current,
                      dilateBy5px: event.currentTarget.checked,
                    }))
                  }
                  aria-label="Apply five pixel dilation"
                />
              </label>
            </div>
          </div>
        </>
      );
    }

    if (activeToolId === 'smartLasso' || activeToolId === 'lasso') {
      return (
        <>
          <div className="h-px w-full border-b border-slate-800/70" />
          <div className="flex w-full flex-col gap-3 px-3 py-2 text-xs text-slate-400">
            <label className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Feather
              <input
                type="range"
                min={0}
                max={0.05}
                step={0.005}
                value={selection.selectionFeather}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    selectionFeather: clamp(Number(event.currentTarget.value), 0, 0.25),
                  }))
                }
                aria-label="Selection Feather"
              />
            </label>
            <p className="-mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Feather radius: {(selection.selectionFeather * 100).toFixed(1)}% of mask size
            </p>
            <label className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Edge Width
              <input
                type="range"
                min={0.005}
                max={0.08}
                step={0.005}
                value={selection.edgeRefinementWidth}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    edgeRefinementWidth: clamp(Number(event.currentTarget.value), 0.005, 0.25),
                  }))
                }
                aria-label="Edge Width"
              />
            </label>
            <p className="-mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
              Edge band: {(selection.edgeRefinementWidth * 100).toFixed(1)}%
            </p>
            {activeToolId === 'smartLasso' && (
              <label className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-500">
                Smart Stickiness
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={selection.smartStickiness}
                  onChange={(event) =>
                    updateSelection((current) => ({
                      ...current,
                      smartStickiness: clamp(Number(event.currentTarget.value), 0, 1),
                    }))
                  }
                  aria-label="Smart Stickiness"
                />
              </label>
            )}
            {activeToolId === 'smartLasso' && (
              <p className="-mt-1 text-[10px] uppercase tracking-[0.3em] text-slate-500">
                Stickiness: {Math.round(selection.smartStickiness * 100)}%
              </p>
            )}
            <label className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/40 px-3 py-2 text-[11px] font-medium text-slate-200">
              <span>+5px dilation</span>
              <input
                type="checkbox"
                checked={selection.dilateBy5px}
                onChange={(event) =>
                  updateSelection((current) => ({
                    ...current,
                    dilateBy5px: event.currentTarget.checked,
                  }))
                }
                aria-label="Apply five pixel dilation"
              />
            </label>
          </div>
        </>
      );
    }

    return <div className="h-px w-full border-b border-slate-800/70" />;
  };

  if (!imageUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Upload a map image to start outlining rooms.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="relative flex min-h-[420px] flex-col overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-950/70">
          <div className="flex min-h-0 flex-1">
            <div className="flex w-20 flex-col items-center gap-4 border-r border-slate-800/70 bg-slate-950/80 px-3 py-5">
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={defineState.mode === 'editing' ? handleFinishRoom : handleAddRoom}
                  disabled={defineState.mode === 'editing' && !canFinish}
                  aria-label={defineState.mode === 'editing' ? 'Finish Room' : 'Add Room'}
                  title={defineState.mode === 'editing' ? 'Finish Room' : 'Add Room'}
                  className={addRoomButtonClasses}
                >
                  {defineState.mode === 'editing' ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 13.5L10 18l9-12" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                  )}
                </button>
                {defineState.mode === 'editing' && (
                  <button
                    type="button"
                    onClick={handleCancelEditing}
                    aria-label="Cancel Room Editing"
                    title="Cancel Room Editing"
                    className="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/70 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25 focus:outline-none focus:ring-2 focus:ring-rose-400/50 focus:ring-offset-0"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M6 18L18 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="h-px w-full border-b border-slate-800/70" />
              <div className="flex flex-col items-center gap-3" role="group" aria-label="Editor tools">
                <button
                  type="button"
                  onClick={() => defineRoomsStore.setTool('paintbrush')}
                  aria-label="Paintbrush"
                  title="Paintbrush"
                  aria-pressed={activeToolId === 'paintbrush'}
                  className={toolButtonClasses(activeToolId === 'paintbrush')}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M15.5 3.5L20.5 8.5L11 18c-1.1 1.1-2.6 1.5-3.8.8l-1.4-.7" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 18c-.2 1.5-1.2 3-3 3 0-2.6 1.4-3.4 3-3z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => defineRoomsStore.setTool('lasso')}
                  aria-label="Lasso"
                  aria-pressed={activeToolId === 'lasso'}
                  className={toolButtonClasses(activeToolId === 'lasso')}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5c3.6 0 6.5 2.2 6.5 5s-2.9 5-6.5 5-6.5-2.2-6.5-5 2.9-5 6.5-5z" stroke="currentColor" strokeWidth={1.6} />
                    <path d="M12 15v3.5a2 2 0 01-2 2H8.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => defineRoomsStore.setTool('smartLasso')}
                  aria-label="Smart Lasso"
                  aria-pressed={activeToolId === 'smartLasso'}
                  className={toolButtonClasses(activeToolId === 'smartLasso')}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 5.5c3.3 0 6 2 6 4.5s-2.7 4.5-6 4.5-6-2-6-4.5 2.7-4.5 6-4.5z" stroke="currentColor" strokeWidth={1.6} />
                    <path d="M6 14c0 1.4 1 2.3 2.4 2.3H9" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                    <path d="M6.5 3.7l.7 1.6 1.7.3-1.3 1 .3 1.7-1.4-.8-1.4.8.3-1.7-1.3-1 1.7-.3z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => defineRoomsStore.setTool('autoWand')}
                  aria-label="Magic Wand"
                  aria-pressed={activeToolId === 'autoWand'}
                  className={toolButtonClasses(activeToolId === 'autoWand')}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 18l6-6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M15 3l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" fill="currentColor" />
                    <path d="M12 6l3 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {renderToolSettings()}
              <div className="h-px w-full border-b border-slate-800/70" />
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleZoomToggle}
                  aria-label={zoomLevel >= 2 ? 'Reset Zoom' : 'Zoom In'}
                  title={zoomLevel >= 2 ? 'Reset Zoom' : 'Zoom In'}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-200 transition hover:border-slate-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-teal-400/60 focus:ring-offset-0"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx={11} cy={11} r={5} stroke="currentColor" strokeWidth={1.6} />
                    <path d="M15.5 15.5L19 19" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                    <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
                  </svg>
                </button>
                <span className="text-[10px] uppercase tracking-[0.35em] text-slate-500">{zoomDisplay}%</span>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div ref={containerRef} className="relative flex flex-1 items-center justify-center overflow-hidden">
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="Map editor"
                  onLoad={refreshViewport}
                  className="pointer-events-none h-full w-full select-none object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                />
                {metrics && (
                  <svg
                    role="presentation"
                    className="absolute inset-0 transition-transform duration-200"
                    style={{
                      left: metrics.offsetX,
                      top: metrics.offsetY,
                      width: metrics.width,
                      height: metrics.height,
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: 'center center',
                    }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerCancel}
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
                      if (!room.isVisible || room.id === draft?.id) {
                        return null;
                      }
                      const roomPolygon = roomMaskToPolygon(room.mask);
                      const overlay = polygonToAttribute(roomPolygon, metrics);
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
              <div className="border-t border-slate-800/70 py-3 pr-5 pl-5 text-xs text-slate-400">
                {defineState.mode === 'editing' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      Active tool:
                      <span className="ml-2 rounded-full border border-slate-700 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-200">
                        {toolLabel}
                      </span>
                    </span>
                    <div className="flex flex-wrap items-center gap-4 text-slate-500">
                      <span>
                        {defineState.busyMessage ||
                          'Left click to add, right click or hold Alt/Ctrl to erase when using the brush.'}
                      </span>
                      <span>Zoom {zoomDisplay}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>Select an existing room or start a new one to begin outlining areas.</span>
                    <span className="text-slate-500">Zoom {zoomDisplay}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-3xl border border-slate-800/70 bg-slate-950/70 p-5">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Room Metadata</p>
            {defineState.mode === 'editing' && draft ? (
              <div className="mt-4 space-y-4">
                <label className="block text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Name</span>
                  <input
                    type="text"
                    value={draft?.name ?? ''}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, name: event.target.value, isDirty: true } : current
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                    placeholder="Great Hall"
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Notes</span>
                  <textarea
                    value={draft?.notes ?? ''}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, notes: event.target.value, isDirty: true } : current
                      )
                    }
                    className="mt-2 min-h-[96px] w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                    placeholder="Secret door in the northwest corner"
                  />
                </label>
                <label className="block text-sm text-slate-200">
                  <span className="text-xs uppercase tracking-[0.35em] text-slate-500">Tags</span>
                  <input
                    type="text"
                    value={draft ? draft.tags.join(', ') : ''}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              tags: event.target.value
                                .split(',')
                                .map((tag) => tag.trim())
                                .filter(Boolean),
                              isDirty: true,
                            }
                          : current
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-800/70 bg-slate-900/70 px-4 py-2 text-sm text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
                    placeholder="entrance, danger"
                  />
                </label>
                <label className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-slate-400">
                  <input
                    type="checkbox"
                    checked={draft?.isVisible ?? true}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, isVisible: event.currentTarget.checked, isDirty: true } : current
                      )
                    }
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
                  const isActive = draft?.id === room.id;
                  const roomPolygon = roomMaskToPolygon(room.mask);
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
                          <p className="mt-1 text-xs text-slate-500">{roomPolygon.length} points · {room.tags.join(', ') || 'No tags'}</p>
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
