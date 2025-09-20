import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import {
  buildEdgeMap,
  computeDisplayMetrics,
  snapPolygonToEdges,
  smoothPolygon,
  type EdgeMap,
  type ImageDisplayMetrics,
} from '../utils/imageProcessing';
import {
  ROOM_TOOL_INSTRUCTIONS,
  ROOM_TOOL_OPTIONS,
  DEFAULT_ROOM_TOOL,
  getRoomToolOption,
  type RoomTool,
} from './roomToolOptions';
import {
  applyBrushToMask,
  dilateMask,
  extractLargestPolygonFromMask,
  floodFillRoomMask,
  type RasterImageData,
} from '../utils/roomToolUtils';
import type { Campaign, MapRecord, Marker, Region } from '../types';

type WizardStep = 0 | 1 | 2 | 3;

interface MapCreationWizardProps {
  campaign: Campaign;
  onClose: () => void;
  onComplete: (map: MapRecord, markers: Marker[], regions: Region[]) => void;
}

interface DraftMarker {
  id: string;
  label: string;
  color: string;
  notes: string;
  x: number;
  y: number;
}

interface DraftRoom {
  id: string;
  name: string;
  notes: string;
  tagsInput: string;
  polygon: Array<{ x: number; y: number }>;
  isVisible: boolean;
  tool: RoomTool;
}

interface RoomAdjustmentState {
  roomId: string;
  brushRadius: number;
  startedInside: boolean | null;
  isPointerActive: boolean;
  originalPolygon: Array<{ x: number; y: number }>;
}

const distanceBetweenPoints = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const simplifyPolygon = (points: Array<{ x: number; y: number }>, tolerance = 0.004) => {
  if (points.length <= 3) return points;

  const perpendicularDistance = (
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ) => {
    const area =
      Math.abs(
        0.5 *
          (lineStart.x * lineEnd.y + lineEnd.x * point.y + point.x * lineStart.y - lineEnd.x * lineStart.y - point.x * lineEnd.y - lineStart.x * point.y)
      );
    const base = distanceBetweenPoints(lineStart, lineEnd) || Number.EPSILON;
    return (area * 2) / base;
  };

  const rdp = (pts: Array<{ x: number; y: number }>, epsilon: number): Array<{ x: number; y: number }> => {
    if (pts.length < 3) return pts;
    let maxDistance = 0;
    let index = 0;
    const last = pts.length - 1;
    for (let i = 1; i < last; i += 1) {
      const distance = perpendicularDistance(pts[i], pts[0], pts[last]);
      if (distance > maxDistance) {
        index = i;
        maxDistance = distance;
      }
    }
    if (maxDistance > epsilon) {
      const left = rdp(pts.slice(0, index + 1), epsilon);
      const right = rdp(pts.slice(index), epsilon);
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[last]];
  };

  const simplified = rdp(points, tolerance);
  return simplified.length >= 3 ? simplified : points;
};

const normalisePolygon = (points: Array<{ x: number; y: number }>) => {
  const filtered = points.filter((point, index) => {
    if (index === 0) return true;
    return distanceBetweenPoints(point, points[index - 1]) > 0.0015;
  });
  return filtered;
};

const computeSignedArea = (polygon: Array<{ x: number; y: number }>) => {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
};

const normalizeVector = (vector: { x: number; y: number }) => {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 1e-6) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
};

const applyPolygonBrushAdjustment = (
  polygon: Array<{ x: number; y: number }>,
  path: Array<{ x: number; y: number }>,
  options: { brushRadius: number; mode: 'expand' | 'shrink' }
) => {
  if (polygon.length < 3 || path.length === 0 || options.brushRadius <= 0) {
    return polygon;
  }

  const activePoint = path[path.length - 1];
  const orientation = computeSignedArea(polygon) >= 0 ? 1 : -1;
  const directionMultiplier = options.mode === 'expand' ? 1 : -1;
  const normals = polygon.map((point, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];
    const edgePrev = { x: point.x - previous.x, y: point.y - previous.y };
    const edgeNext = { x: next.x - point.x, y: next.y - point.y };
    const normalPrev = normalizeVector({
      x: edgePrev.y * orientation,
      y: -edgePrev.x * orientation,
    });
    const normalNext = normalizeVector({
      x: edgeNext.y * orientation,
      y: -edgeNext.x * orientation,
    });
    let combined = { x: normalPrev.x + normalNext.x, y: normalPrev.y + normalNext.y };
    if (Math.hypot(combined.x, combined.y) < 1e-6) {
      combined = normalPrev.x !== 0 || normalPrev.y !== 0 ? normalPrev : normalNext;
    }
    return normalizeVector(combined);
  });

  const brushRadius = options.brushRadius;
  const baseStrength = brushRadius * 0.6;
  const adjusted = polygon.map((point, index) => {
    const distance = distanceBetweenPoints(point, activePoint);
    if (distance > brushRadius) {
      return point;
    }
    const falloff = Math.pow(1 - distance / brushRadius, 2);
    const offsetAmount = baseStrength * falloff * directionMultiplier;
    const normal = normals[index];
    return {
      x: point.x + normal.x * offsetAmount,
      y: point.y + normal.y * offsetAmount,
    };
  });

  const clamped = adjusted.map((point) => ({
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  }));
  let normalised = normalisePolygon(clamped);
  if (normalised.length >= 3) {
    normalised = simplifyPolygon(normalised, 0.0015);
    normalised = normalisePolygon(normalised);
  }
  if (normalised.length < 3) {
    return polygon;
  }
  return normalised.map((point) => ({ ...point }));
};

const computeCentroid = (polygon: Array<{ x: number; y: number }>) => {
  if (polygon.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const cross = current.x * next.y - next.x * current.y;
    area += cross;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < Number.EPSILON) {
    const sum = polygon.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 }
    );
    return { x: sum.x / polygon.length, y: sum.y / polygon.length };
  }
  const factor = 1 / (6 * area);
  return { x: x * factor, y: y * factor };
};

const parseTagsInput = (input: string) =>
  input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const steps: Array<{ title: string; description: string }> = [
  {
    title: 'Upload Map Image',
    description: 'Drop in the battle map image you want to use for this campaign.',
  },
  {
    title: 'Map Details',
    description: 'Name your map, assign it to a folder, and capture quick notes or tags.',
  },
  {
    title: 'Define Rooms',
    description: 'Outline rooms and hallways to control what your players can see.',
  },
  {
    title: 'Add Markers',
    description: 'Drag markers onto the map to highlight points of interest for your players.',
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const DEFAULT_ROOM_ADJUST_BRUSH_RADIUS = 0.035;

const resolveNormalizedPointWithinImage = (
  event: { clientX: number; clientY: number },
  container: HTMLDivElement | null,
  imageDimensions: { width: number; height: number } | null
) => {
  if (!container || !imageDimensions) return null;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const metrics = computeDisplayMetrics(rect.width, rect.height, imageDimensions.width, imageDimensions.height);
  const relativeX = clamp(event.clientX - rect.left - metrics.offsetX, 0, metrics.displayWidth);
  const relativeY = clamp(event.clientY - rect.top - metrics.offsetY, 0, metrics.displayHeight);
  const normalisedX = metrics.displayWidth === 0 ? 0 : relativeX / metrics.displayWidth;
  const normalisedY = metrics.displayHeight === 0 ? 0 : relativeY / metrics.displayHeight;
  return { x: normalisedX, y: normalisedY };
};

const useImageDisplayMetrics = (
  ref: React.RefObject<HTMLDivElement>,
  imageDimensions: { width: number; height: number } | null
) => {
  const [metrics, setMetrics] = useState<ImageDisplayMetrics | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !imageDimensions) {
      setMetrics(null);
      return;
    }

    let animationFrame: number | null = null;

    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      setMetrics(
        computeDisplayMetrics(rect.width, rect.height, imageDimensions.width, imageDimensions.height)
      );
    };

    update();

    const scheduleUpdate = () => {
      if (typeof window === 'undefined') {
        update();
        return;
      }
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        update();
      });
    };

    window.addEventListener('resize', scheduleUpdate);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
    }

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      if (observer) observer.disconnect();
      if (animationFrame !== null) {
        if (typeof window !== 'undefined') {
          window.cancelAnimationFrame(animationFrame);
        }
        animationFrame = null;
      }
    };
  }, [ref, imageDimensions]);

  return metrics;
};

const normalisedToContainerPoint = (
  point: { x: number; y: number },
  metrics: ImageDisplayMetrics | null
) => {
  if (!metrics || metrics.containerWidth === 0 || metrics.containerHeight === 0) {
    return { x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) };
  }
  const pixelX = metrics.offsetX + point.x * metrics.displayWidth;
  const pixelY = metrics.offsetY + point.y * metrics.displayHeight;
  return {
    x: clamp(pixelX / metrics.containerWidth, 0, 1),
    y: clamp(pixelY / metrics.containerHeight, 0, 1),
  };
};

const containerPointToStyle = (point: { x: number; y: number }): React.CSSProperties => ({
  left: `${point.x * 100}%`,
  top: `${point.y * 100}%`,
});

const MapCreationWizard: React.FC<MapCreationWizardProps> = ({ campaign, onClose, onComplete }) => {
  const [step, setStep] = useState<WizardStep>(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [grouping, setGrouping] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const mapAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [markers, setMarkers] = useState<DraftMarker[]>([]);
  const [rooms, setRooms] = useState<DraftRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [selectedRoomTool, setSelectedRoomTool] = useState<RoomTool>(DEFAULT_ROOM_TOOL);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isOutliningRoom, setIsOutliningRoom] = useState(false);
  const [isDrawingRoom, setIsDrawingRoom] = useState(false);
  const [draftRoomPoints, setDraftRoomPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [adjustingRoom, setAdjustingRoom] = useState<RoomAdjustmentState | null>(null);

  const roomsMapRef = useRef<HTMLDivElement>(null);
  const drawingPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const edgeMapRef = useRef<EdgeMap | null>(null);
  const sourceImageRef = useRef<RasterImageData | null>(null);
  const outlineToolRef = useRef<RoomTool>(DEFAULT_ROOM_TOOL);
  const adjustmentPathRef = useRef<Array<{ x: number; y: number }>>([]);
  const adjustmentPointerIdRef = useRef<number | null>(null);
  const toolMenuRef = useRef<HTMLDivElement>(null);
  const toolButtonRef = useRef<HTMLButtonElement>(null);
  const paintbrushMaskRef = useRef<Uint8Array | null>(null);
  const paintbrushDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const paintbrushRadiusRef = useRef<number>(0);
  const paintbrushLastPointRef = useRef<{ x: number; y: number } | null>(null);

  const roomsDisplayMetrics = useImageDisplayMetrics(roomsMapRef, imageDimensions);
  const markerDisplayMetrics = useImageDisplayMetrics(mapAreaRef, imageDimensions);

  const resolveRelativePoint = useCallback(
    (event: { clientX: number; clientY: number }) =>
      resolveNormalizedPointWithinImage(event, roomsMapRef.current, imageDimensions),
    [imageDimensions]
  );

  const finalizeRoomOutline = useCallback(
    (points: Array<{ x: number; y: number }>) => {
      const activeTool = outlineToolRef.current;
      let polygon = normalisePolygon(points);
      if (polygon.length < 3) {
        setIsOutliningRoom(false);
        setDraftRoomPoints([]);
        drawingPointsRef.current = [];
        return;
      }
      if (activeTool === 'smartSnap' || activeTool === 'smartWand') {
        const edgeMap = edgeMapRef.current;
        if (edgeMap && imageDimensions) {
          polygon = snapPolygonToEdges(polygon, {
            edgeMap,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
          });
          polygon = smoothPolygon(polygon, 2);
        }
        polygon = normalisePolygon(polygon);
        polygon = simplifyPolygon(polygon, 0.0025);
        polygon = normalisePolygon(polygon);
      }
      polygon = polygon.map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }));
      const newRoomId = `room-${Date.now()}-${Math.round(Math.random() * 10000)}`;
      setRooms((current) => {
        const nextIndex = current.length + 1;
        return [
          ...current,
          {
            id: newRoomId,
            name: `Room ${nextIndex}`,
            notes: '',
            tagsInput: '',
            polygon,
            isVisible: false,
            tool: activeTool,
          },
        ];
      });
      setActiveRoomId(newRoomId);
      setIsOutliningRoom(false);
      setDraftRoomPoints([]);
      drawingPointsRef.current = [];
    },
    [imageDimensions]
  );

  const handleSmartWandSelection = useCallback(
    (point: { x: number; y: number }) => {
      const source = sourceImageRef.current;
      if (!source) {
        setIsOutliningRoom(false);
        return;
      }
      const { width, height } = source;
      if (width <= 0 || height <= 0) {
        setIsOutliningRoom(false);
        return;
      }
      drawingPointsRef.current = [];
      setDraftRoomPoints([]);
      setIsDrawingRoom(false);
      const px = clamp(point.x * width, 0, width - 1);
      const py = clamp(point.y * height, 0, height - 1);
      const startX = Math.floor(px);
      const startY = Math.floor(py);
      const edgeMap = edgeMapRef.current ?? null;
      const result = floodFillRoomMask(source, edgeMap, startX, startY, {
        colorTolerance: 48,
        gradientThreshold: edgeMap ? edgeMap.maxMagnitude * 0.36 : undefined,
        maxPixels: Math.max(512, Math.floor(width * height * 0.65)),
      });
      if (!result) {
        setIsOutliningRoom(false);
        return;
      }
      const polygon = extractLargestPolygonFromMask(result.mask, width, height);
      if (polygon.length >= 3) {
        finalizeRoomOutline(polygon);
      } else {
        setIsOutliningRoom(false);
      }
    },
    [finalizeRoomOutline]
  );

  useEffect(() => {
    if (!isDrawingRoom) return;

    const handlePointerMove = (event: PointerEvent) => {
      const point = resolveRelativePoint(event);
      if (!point) return;
      const activeTool = outlineToolRef.current;
      if (activeTool === 'paintbrush') {
        const dimensions = paintbrushDimensionsRef.current;
        const mask = paintbrushMaskRef.current;
        const radius = paintbrushRadiusRef.current;
        if (!dimensions || !mask || radius <= 0) return;
        const px = clamp(point.x * dimensions.width, 0, dimensions.width - 1);
        const py = clamp(point.y * dimensions.height, 0, dimensions.height - 1);
        const last = paintbrushLastPointRef.current;
        const distance = last ? Math.hypot(px - last.x, py - last.y) : 0;
        const steps = last ? Math.max(1, Math.ceil(distance / Math.max(radius * 0.6, 1))) : 1;
        for (let step = 0; step <= steps; step += 1) {
          const t = steps === 0 ? 0 : step / steps;
          const sampleX = last ? last.x + (px - last.x) * t : px;
          const sampleY = last ? last.y + (py - last.y) * t : py;
          applyBrushToMask(mask, dimensions.width, dimensions.height, sampleX, sampleY, radius);
        }
        paintbrushLastPointRef.current = { x: px, y: py };
        drawingPointsRef.current = [...drawingPointsRef.current, point];
        if (drawingPointsRef.current.length > 256) {
          drawingPointsRef.current = drawingPointsRef.current.slice(-256);
        }
        setDraftRoomPoints([...drawingPointsRef.current]);
        return;
      }
      const lastPoint = drawingPointsRef.current[drawingPointsRef.current.length - 1];
      if (!lastPoint || distanceBetweenPoints(lastPoint, point) > 0.001) {
        drawingPointsRef.current = [...drawingPointsRef.current, point];
        setDraftRoomPoints(drawingPointsRef.current);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      event.preventDefault();
      const activeTool = outlineToolRef.current;
      const completed = drawingPointsRef.current;
      drawingPointsRef.current = [];
      setDraftRoomPoints([]);
      setIsDrawingRoom(false);
      if (activeTool === 'paintbrush') {
        const mask = paintbrushMaskRef.current;
        const dimensions = paintbrushDimensionsRef.current;
        const radius = paintbrushRadiusRef.current;
        paintbrushMaskRef.current = null;
        paintbrushDimensionsRef.current = null;
        paintbrushRadiusRef.current = 0;
        paintbrushLastPointRef.current = null;
        if (mask && dimensions) {
          const dilated = dilateMask(mask, dimensions.width, dimensions.height, radius);
          const polygon = extractLargestPolygonFromMask(dilated, dimensions.width, dimensions.height);
          if (polygon.length >= 3) {
            finalizeRoomOutline(polygon);
            return;
          }
        }
        setIsOutliningRoom(false);
        return;
      }
      if (completed.length >= 3) {
        finalizeRoomOutline(completed);
      } else {
        setIsOutliningRoom(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [finalizeRoomOutline, isDrawingRoom, resolveRelativePoint]);

  const finalizeRoomAdjustment = useCallback(
    (state: RoomAdjustmentState | null) => {
      if (!state) return;
      if (adjustmentPointerIdRef.current !== null && roomsMapRef.current) {
        const release = roomsMapRef.current.releasePointerCapture?.bind(roomsMapRef.current);
        if (release) {
          try {
            release(adjustmentPointerIdRef.current);
          } catch {
            // ignore release errors
          }
        }
      }
      adjustmentPointerIdRef.current = null;
      adjustmentPathRef.current = [];
      const edgeMap = edgeMapRef.current;
      setRooms((current) =>
        current.map((room) => {
          if (room.id !== state.roomId) return room;
          let polygon = normalisePolygon(room.polygon);
          if (room.tool === 'smartSnap' || room.tool === 'smartWand') {
            if (edgeMap && imageDimensions) {
              polygon = snapPolygonToEdges(polygon, {
                edgeMap,
                imageWidth: imageDimensions.width,
                imageHeight: imageDimensions.height,
              });
              polygon = smoothPolygon(polygon, 2);
            }
            polygon = normalisePolygon(polygon);
            polygon = simplifyPolygon(polygon, 0.0025);
            polygon = normalisePolygon(polygon);
          } else {
            polygon = simplifyPolygon(polygon, 0.0015);
            polygon = normalisePolygon(polygon);
          }
          polygon = polygon.map((point) => ({
            x: clamp(point.x, 0, 1),
            y: clamp(point.y, 0, 1),
          }));
          return { ...room, polygon };
        })
      );
      setAdjustingRoom((current) => (current && current.roomId === state.roomId ? null : current));
    },
    [imageDimensions]
  );

  useEffect(() => {
    if (!adjustingRoom || !adjustingRoom.isPointerActive || adjustingRoom.startedInside === null) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const point = resolveRelativePoint(event);
      if (!point) return;
      const last = adjustmentPathRef.current[adjustmentPathRef.current.length - 1];
      const threshold = Math.max(0.0002, adjustingRoom.brushRadius * 0.2);
      if (!last || distanceBetweenPoints(last, point) > threshold) {
        const nextPath = [...adjustmentPathRef.current, point];
        if (nextPath.length > 64) {
          nextPath.splice(0, nextPath.length - 64);
        }
        adjustmentPathRef.current = nextPath;
        const mode = adjustingRoom.startedInside ? 'expand' : 'shrink';
        setRooms((current) =>
          current.map((room) => {
            if (room.id !== adjustingRoom.roomId) return room;
            const nextPolygon = applyPolygonBrushAdjustment(room.polygon, nextPath, {
              brushRadius: adjustingRoom.brushRadius,
              mode,
            });
            return { ...room, polygon: nextPolygon };
          })
        );
      }
    };

    const handlePointerUp = () => {
      finalizeRoomAdjustment(adjustingRoom);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [adjustingRoom, finalizeRoomAdjustment, resolveRelativePoint]);

  useEffect(() => {
    if (!isToolMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!toolMenuRef.current || !toolButtonRef.current) return;
      if (
        !toolMenuRef.current.contains(target) &&
        !toolButtonRef.current.contains(target)
      ) {
        setIsToolMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isToolMenuOpen]);

  useEffect(() => {
    if (!isToolMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsToolMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isToolMenuOpen]);

  useEffect(() => {
    if (!adjustingRoom) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (adjustmentPointerIdRef.current !== null && roomsMapRef.current) {
          const release = roomsMapRef.current.releasePointerCapture?.bind(roomsMapRef.current);
          if (release) {
            try {
              release(adjustmentPointerIdRef.current);
            } catch {
              // ignore release errors
            }
          }
        }
        adjustmentPointerIdRef.current = null;
        adjustmentPathRef.current = [];
        setRooms((current) =>
          current.map((room) =>
            room.id === adjustingRoom.roomId
              ? {
                  ...room,
                  polygon: adjustingRoom.originalPolygon.map((point) => ({ ...point })),
                }
              : room
          )
        );
        setAdjustingRoom(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [adjustingRoom]);

  useEffect(() => {
    if (!isOutliningRoom) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOutliningRoom(false);
        setIsDrawingRoom(false);
        drawingPointsRef.current = [];
        setDraftRoomPoints([]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOutliningRoom]);

  useEffect(() => {
    if (activeRoomId && !rooms.some((room) => room.id === activeRoomId)) {
      setActiveRoomId(null);
    }
  }, [activeRoomId, rooms]);

  useEffect(() => {
    if (!adjustingRoom) return;
    if (!rooms.some((room) => room.id === adjustingRoom.roomId)) {
      adjustmentPathRef.current = [];
      adjustmentPointerIdRef.current = null;
      setAdjustingRoom(null);
    }
  }, [adjustingRoom, rooms]);

  const activeRoom = useMemo(() => rooms.find((room) => room.id === activeRoomId) ?? null, [activeRoomId, rooms]);
  const activeRoomCenter = useMemo(() => computeCentroid(activeRoom?.polygon ?? []), [activeRoom]);
  const isAdjustingActiveRoom = adjustingRoom?.roomId === activeRoom?.id;
  const activeToolOption = getRoomToolOption(selectedRoomTool);

  const overlayWidth = imageDimensions?.width ?? 1000;
  const overlayHeight = imageDimensions?.height ?? 1000;
  const overlayScale = Math.max(overlayWidth, overlayHeight);
  const roomOverlayStyle = roomsDisplayMetrics
    ? {
        left: `${(roomsDisplayMetrics.offsetX / roomsDisplayMetrics.containerWidth) * 100}%`,
        top: `${(roomsDisplayMetrics.offsetY / roomsDisplayMetrics.containerHeight) * 100}%`,
        width: `${(roomsDisplayMetrics.displayWidth / roomsDisplayMetrics.containerWidth) * 100}%`,
        height: `${(roomsDisplayMetrics.displayHeight / roomsDisplayMetrics.containerHeight) * 100}%`,
      }
    : { left: '0%', top: '0%', width: '100%', height: '100%' };
  const activeRoomAnchor = normalisedToContainerPoint(activeRoomCenter, roomsDisplayMetrics);
  const clampedActiveAnchor = {
    x: clamp(activeRoomAnchor.x, 0.12, 0.88),
    y: clamp(activeRoomAnchor.y, 0.18, 0.85),
  };

  const handleStartRoomAdjustment = useCallback(() => {
    if (!activeRoom) return;
    adjustmentPathRef.current = [];
    adjustmentPointerIdRef.current = null;
    setAdjustingRoom({
      roomId: activeRoom.id,
      brushRadius: DEFAULT_ROOM_ADJUST_BRUSH_RADIUS,
      startedInside: null,
      isPointerActive: false,
      originalPolygon: activeRoom.polygon.map((point) => ({ ...point })),
    });
    setIsOutliningRoom(false);
    setIsDrawingRoom(false);
    setDraftRoomPoints([]);
    drawingPointsRef.current = [];
    setIsToolMenuOpen(false);
  }, [activeRoom]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
      setImageDimensions(null);
      edgeMapRef.current = null;
      sourceImageRef.current = null;
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return objectUrl;
    });
    const image = new Image();
    image.onload = () => {
      setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (context) {
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = new Uint8ClampedArray(imageData.data);
          sourceImageRef.current = { width: canvas.width, height: canvas.height, data: pixels };
          edgeMapRef.current = buildEdgeMap(pixels, canvas.width, canvas.height);
        } else {
          edgeMapRef.current = null;
          sourceImageRef.current = null;
        }
      } catch {
        edgeMapRef.current = null;
        sourceImageRef.current = null;
      }
    };
    image.src = objectUrl;
    return () => {
      image.onload = null;
    };
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!draggingId) return;

    const handlePointerMove = (event: PointerEvent) => {
      const point = resolveNormalizedPointWithinImage(event, mapAreaRef.current, imageDimensions);
      if (!point) return;
      setMarkers((current) =>
        current.map((marker) => (marker.id === draggingId ? { ...marker, x: point.x, y: point.y } : marker))
      );
    };

    const handlePointerUp = () => {
      setDraggingId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingId, imageDimensions]);

  const allowNext = useMemo(() => {
    if (step === 0) {
      return !!file;
    }
    if (step === 1) {
      return name.trim().length > 0;
    }
    return true;
  }, [file, name, step]);

  const tags = useMemo(
    () =>
      tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    [tagsInput]
  );

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setError(null);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleStartRoomOutline = useCallback(
    (nextTool?: RoomTool) => {
      if (!previewUrl) return;
      const tool = nextTool ?? selectedRoomTool;
      outlineToolRef.current = tool;
      setSelectedRoomTool(tool);
      setActiveRoomId(null);
      setAdjustingRoom(null);
      adjustmentPathRef.current = [];
      adjustmentPointerIdRef.current = null;
      paintbrushMaskRef.current = null;
      paintbrushDimensionsRef.current = null;
      paintbrushRadiusRef.current = 0;
      paintbrushLastPointRef.current = null;
      setIsOutliningRoom(true);
      setIsDrawingRoom(false);
      setDraftRoomPoints([]);
      drawingPointsRef.current = [];
      setIsToolMenuOpen(false);
    },
    [previewUrl, selectedRoomTool]
  );

  const handleSelectRoomTool = useCallback(
    (tool: RoomTool) => {
      if (isOutliningRoom) return;
      handleStartRoomOutline(tool);
    },
    [handleStartRoomOutline, isOutliningRoom]
  );

  const handleCancelRoomOutline = () => {
    setIsOutliningRoom(false);
    setIsDrawingRoom(false);
    setDraftRoomPoints([]);
    drawingPointsRef.current = [];
    adjustmentPathRef.current = [];
    adjustmentPointerIdRef.current = null;
    paintbrushMaskRef.current = null;
    paintbrushDimensionsRef.current = null;
    paintbrushRadiusRef.current = 0;
    paintbrushLastPointRef.current = null;
  };

  const handleRoomPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (adjustingRoom) {
      const room = rooms.find((candidate) => candidate.id === adjustingRoom.roomId);
      if (!room) {
        setAdjustingRoom(null);
        return;
      }
      const point = resolveRelativePoint(event.nativeEvent);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      adjustmentPathRef.current = [point];
      adjustmentPointerIdRef.current = event.pointerId;
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // ignore capture errors
        }
      }
      const startedInside = pointInPolygon(point, room.polygon);
      setAdjustingRoom((current) => {
        if (!current || current.roomId !== room.id) return current;
        return { ...current, startedInside, isPointerActive: true };
      });
      return;
    }
    if (!isOutliningRoom) return;
    event.preventDefault();
    const point = resolveRelativePoint(event.nativeEvent);
    if (!point) return;
    const activeTool = outlineToolRef.current;
    if (activeTool === 'smartWand') {
      event.stopPropagation();
      handleSmartWandSelection(point);
      return;
    }
    if (activeTool === 'paintbrush') {
      event.stopPropagation();
      const dimensions = imageDimensions;
      if (!dimensions) {
        setIsOutliningRoom(false);
        return;
      }
      const total = dimensions.width * dimensions.height;
      if (total <= 0) {
        setIsOutliningRoom(false);
        return;
      }
      const mask = new Uint8Array(total);
      paintbrushMaskRef.current = mask;
      paintbrushDimensionsRef.current = { ...dimensions };
      const maxDimension = Math.max(dimensions.width, dimensions.height);
      const radius = Math.max(3, Math.round(maxDimension * 0.012));
      paintbrushRadiusRef.current = radius;
      const px = clamp(point.x * dimensions.width, 0, dimensions.width - 1);
      const py = clamp(point.y * dimensions.height, 0, dimensions.height - 1);
      applyBrushToMask(mask, dimensions.width, dimensions.height, px, py, radius);
      paintbrushLastPointRef.current = { x: px, y: py };
      drawingPointsRef.current = [point];
      setDraftRoomPoints([point]);
      setIsDrawingRoom(true);
      return;
    }
    drawingPointsRef.current = [point];
    setDraftRoomPoints([point]);
    setIsDrawingRoom(true);
  };

  const handleRoomClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isOutliningRoom || isDrawingRoom || adjustingRoom) return;
    const point = resolveRelativePoint(event.nativeEvent);
    if (!point) return;
    let matched: DraftRoom | null = null;
    for (let index = rooms.length - 1; index >= 0; index -= 1) {
      const candidate = rooms[index];
      if (pointInPolygon(point, candidate.polygon)) {
        matched = candidate;
        break;
      }
    }
    setActiveRoomId(matched ? matched.id : null);
  };

  const handleRoomFieldChange = (roomId: string, field: 'name' | 'notes' | 'tagsInput', value: string) => {
    setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, [field]: value } : room)));
  };

  const handleRoomVisibilityToggle = (roomId: string, nextValue: boolean) => {
    setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, isVisible: nextValue } : room)));
  };

  const handleAutoSnapRoom = (roomId: string) => {
    setAdjustingRoom((current) => (current && current.roomId === roomId ? null : current));
    adjustmentPathRef.current = [];
    adjustmentPointerIdRef.current = null;
    const edgeMap = edgeMapRef.current;
    setRooms((current) =>
      current.map((room) => {
        if (room.id !== roomId) return room;
        let polygon = normalisePolygon(room.polygon);
        if (edgeMap && imageDimensions) {
          polygon = snapPolygonToEdges(polygon, {
            edgeMap,
            imageWidth: imageDimensions.width,
            imageHeight: imageDimensions.height,
          });
          polygon = smoothPolygon(polygon, 2);
        }
        polygon = normalisePolygon(polygon);
        polygon = simplifyPolygon(polygon, 0.0025);
        polygon = normalisePolygon(polygon);
        polygon = polygon.map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }));
        return { ...room, polygon };
      })
    );
  };

  const handleRemoveRoom = (roomId: string) => {
    setRooms((current) => current.filter((room) => room.id !== roomId));
    setActiveRoomId((current) => (current === roomId ? null : current));
    setAdjustingRoom((current) => (current && current.roomId === roomId ? null : current));
  };

  const handleMarkerChange = (markerId: string, field: keyof DraftMarker, value: string) => {
    setMarkers((current) =>
      current.map((marker) =>
        marker.id === markerId
          ? {
              ...marker,
              [field]: field === 'x' || field === 'y' ? Number(value) : value,
            }
          : marker
      )
    );
  };

  const handleRemoveMarker = (markerId: string) => {
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
  };

  const handleAddMarker = () => {
    const nextIndex = markers.length + 1;
    const newMarker: DraftMarker = {
      id: `draft-${Date.now()}-${nextIndex}`,
      label: `Marker ${nextIndex}`,
      color: '#facc15',
      notes: '',
      x: 0.5,
      y: 0.5,
    };
    setMarkers((current) => [...current, newMarker]);
  };

  const handleContinue = () => {
    if (step < steps.length - 1) {
      setStep((current) => (current + 1) as WizardStep);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onClose();
      return;
    }
    setStep((current) => (current - 1) as WizardStep);
  };

  const handleComplete = async () => {
    if (!file) {
      setError('Upload an image before creating your map.');
      return;
    }
    if (!imageDimensions) {
      setError('Image dimensions could not be determined. Try uploading the file again.');
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const metadata: Record<string, unknown> = {};
      if (description.trim()) {
        metadata.description = description.trim();
      }
      if (grouping.trim()) {
        metadata.grouping = grouping.trim();
      }
      if (notes.trim()) {
        metadata.notes = notes.trim();
      }
      if (tags.length > 0) {
        metadata.tags = tags;
      }
      if (rooms.length > 0) {
        const roomEntries = rooms.map((room) => {
          const trimmedName = room.name.trim();
          const trimmedNotes = room.notes.trim();
          const roomTags = parseTagsInput(room.tagsInput);
          const entry: Record<string, unknown> = {
            id: room.id,
            polygon: room.polygon,
            isVisible: room.isVisible,
            tool: room.tool,
          };
          if (trimmedName) {
            entry.name = trimmedName;
          }
          if (trimmedNotes) {
            entry.notes = trimmedNotes;
          }
          if (roomTags.length > 0) {
            entry.tags = roomTags;
          }
          return entry;
        });
        metadata.rooms = roomEntries;
        const visibleRoomNames = rooms
          .filter((room) => room.isVisible)
          .map((room) => room.name.trim() || room.id);
        if (visibleRoomNames.length > 0) {
          metadata.visibleRooms = visibleRoomNames;
        }
      }
      const response = await apiClient.createMap({
        campaignId: campaign.id,
        name: name.trim(),
        originalExtension: extension,
        width: imageDimensions.width,
        height: imageDimensions.height,
        metadata,
      });
      const { map, uploads } = response;

      const uploadFile = async (url: string) => {
        await fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });
      };

      await uploadFile(uploads.original);
      await uploadFile(uploads.display);

      const createdMarkers: Marker[] = [];
      for (const marker of markers) {
        const payload = await apiClient.createMarker(map.id, {
          label: marker.label.trim() || 'Marker',
          notes: marker.notes.trim() || undefined,
          color: marker.color.trim() || undefined,
          x: marker.x,
          y: marker.y,
        });
        createdMarkers.push(payload);
      }

      const createdRegions: Region[] = [];
      for (const [index, room] of rooms.entries()) {
        const roomTags = parseTagsInput(room.tagsInput);
        const compiledNotes = [
          room.notes.trim(),
          roomTags.length > 0 ? `Tags: ${roomTags.join(', ')}` : '',
          room.isVisible ? 'Visible to players at start.' : '',
        ]
          .filter(Boolean)
          .join('\n');
        const region = await apiClient.createRegion(map.id, {
          name: room.name.trim() || `Room ${index + 1}`,
          polygon: room.polygon,
          notes: compiledNotes || undefined,
          revealOrder: index + 1,
        });
        createdRegions.push(region);
      }

      onComplete(map, createdMarkers, createdRegions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-sm">
      <header className="border-b border-slate-800/70 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-teal-300">New Map Wizard</p>
            <h2 className="text-2xl font-bold text-white">{steps[step].title}</h2>
            <p className="text-sm text-slate-400">{steps[step].description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-rose-400/60 hover:text-rose-200"
          >
            Exit Wizard
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {steps.map((item, index) => {
            const isActive = index === step;
            const isComplete = index < step;
            return (
              <div
                key={item.title}
                className={`flex items-center gap-3 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                  isActive
                    ? 'border-teal-400/70 bg-teal-500/20 text-teal-100'
                    : isComplete
                    ? 'border-slate-700/70 bg-slate-800/80 text-slate-200'
                    : 'border-slate-800/70 bg-slate-900/80 text-slate-500'
                }`}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-current">
                  {index + 1}
                </span>
                {item.title}
              </div>
            );
          })}
        </div>
      </header>
      <main className="flex-1 overflow-auto px-6 py-8">
        {step === 0 && (
          <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800/70 bg-slate-900/70 p-10 text-center">
            <div
              onDragEnter={(event) => event.preventDefault()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              className="group relative flex min-h-[240px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700/70 bg-slate-950/70 px-6 py-10 transition hover:border-teal-400/60"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) {
                    setFile(selected);
                  }
                }}
              />
              <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Drag & Drop</p>
              <h3 className="mt-3 text-2xl font-semibold text-white">Drop your map image here</h3>
              <p className="mt-2 max-w-xl text-sm text-slate-400">
                We accept PNG, JPG, WEBP, and other common image formats. Drop the file or browse your computer to get started.
              </p>
              <button
                type="button"
                onClick={handleBrowse}
                className="mt-6 rounded-full border border-teal-400/60 bg-teal-500/80 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
              >
                Browse Files
              </button>
            </div>
            {previewUrl && (
              <div className="mt-8">
                <p className="text-xs uppercase tracking-[0.4em] text-teal-300">Preview</p>
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800/70">
                  <img src={previewUrl} alt="Uploaded map preview" className="max-h-[360px] w-full object-contain" />
                </div>
                {imageDimensions && (
                  <p className="mt-2 text-xs uppercase tracking-[0.4em] text-slate-500">
                    {imageDimensions.width} × {imageDimensions.height} pixels
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {step === 1 && (
          <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800/70 bg-slate-900/70 p-10">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-6">
                <div>
                  <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Map Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                    placeholder="Ancient Ruins"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Description</label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                    placeholder="Give a brief overview of the map."
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Grouping</label>
                  <input
                    type="text"
                    value={grouping}
                    onChange={(event) => setGrouping(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                    placeholder="Dungeon Delves"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                    placeholder="DM-only reminders or encounter tips"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Tags</label>
                  <input
                    type="text"
                    value={tagsInput}
                    onChange={(event) => setTagsInput(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                    placeholder="forest, ruins, night"
                  />
                  <p className="mt-2 text-xs text-slate-500">Separate tags with commas to help search and filtering.</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/70">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Map preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
                      Upload a map image to see the preview.
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 text-xs text-slate-400">
                  <p className="uppercase tracking-[0.4em] text-slate-500">Campaign</p>
                  <p className="mt-2 text-sm text-white">{campaign.name}</p>
                  {imageDimensions && (
                    <p className="mt-3 text-xs uppercase tracking-[0.4em] text-slate-500">
                      {imageDimensions.width} × {imageDimensions.height} pixels
                    </p>
                  )}
                  {tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full border border-slate-700/70 bg-slate-900/70 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="flex h-full flex-col">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Fog of War</p>
                <h3 className="text-lg font-semibold text-white">Define Rooms &amp; Hallways</h3>
                <p className="text-xs text-slate-500">
                  Outline rooms, corridors, and secret spaces with the lasso, smart snap, paintbrush, or smart wand tools to
                  keep them hidden until you are ready to reveal them.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <button
                    ref={toolButtonRef}
                    type="button"
                    onClick={() => {
                      if (!previewUrl || isOutliningRoom) return;
                      setIsToolMenuOpen((current) => !current);
                    }}
                    disabled={!previewUrl || isOutliningRoom}
                    title={activeToolOption.tooltip}
                    className={`flex min-w-[180px] flex-col items-start rounded-2xl border px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.3em] transition ${
                      previewUrl && !isOutliningRoom
                        ? 'border-teal-400/60 bg-teal-500/80 text-slate-900 hover:bg-teal-400/90'
                        : 'cursor-not-allowed border-slate-800/70 bg-slate-900/70 text-slate-500'
                    }`}
                  >
                    <span className="text-[11px]">+ Add Room</span>
                    <span className="mt-1 text-[9px] tracking-[0.35em] opacity-80">
                      {previewUrl ? `Use ${activeToolOption.label}` : 'Upload a map first'}
                    </span>
                  </button>
                  {isToolMenuOpen && (
                    <div
                      ref={toolMenuRef}
                      className="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-2 shadow-2xl"
                    >
                      {ROOM_TOOL_OPTIONS.map((option) => {
                        const isActive = option.id === selectedRoomTool;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => handleSelectRoomTool(option.id)}
                            className={`w-full rounded-xl px-4 py-3 text-left transition ${
                              isActive
                                ? 'border border-teal-400/60 bg-teal-500/20 text-teal-100'
                                : 'border border-transparent text-slate-300 hover:border-teal-400/40 hover:bg-slate-800/60 hover:text-teal-100'
                            }`}
                            title={option.tooltip}
                          >
                            <span className="text-sm font-semibold">{option.label}</span>
                            <span className="mt-1 block text-[11px] text-slate-400">{option.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
                  Choose a capture tool to outline rooms quickly.
                </p>
              </div>
            </div>
            <div className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div
                ref={roomsMapRef}
                className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/70"
                onPointerDown={handleRoomPointerDown}
                onClick={handleRoomClick}
              >
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt="Room outlining map preview"
                      className="h-full w-full select-none object-contain"
                      draggable={false}
                    />
                    <svg
                      className="pointer-events-none absolute"
                      viewBox={`0 0 ${overlayWidth} ${overlayHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                      style={roomOverlayStyle}
                    >
                      {rooms.map((room) => {
                        const isActive = room.id === activeRoomId;
                        const polygonPoints = room.polygon
                          .map((point) => `${point.x * overlayWidth},${point.y * overlayHeight}`)
                          .join(' ');
                        const center = computeCentroid(room.polygon);
                        const strokeWidth = isActive ? overlayScale * 0.006 : overlayScale * 0.004;
                        return (
                          <g key={room.id}>
                            <polygon
                              points={polygonPoints}
                              fill={isActive ? 'rgba(45, 212, 191, 0.28)' : 'rgba(59, 130, 246, 0.22)'}
                              stroke={isActive ? 'rgba(45, 212, 191, 0.9)' : 'rgba(148, 163, 184, 0.9)'}
                              strokeWidth={strokeWidth}
                            />
                            <text
                              x={center.x * overlayWidth}
                              y={center.y * overlayHeight}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className="fill-white text-[26px] font-semibold"
                              opacity={0.9}
                            >
                              {room.name || 'Room'}
                            </text>
                          </g>
                        );
                      })}
                      {draftRoomPoints.length > 1 && (
                        <polyline
                          points={[...draftRoomPoints, draftRoomPoints[0]]
                            .map((point) => `${point.x * overlayWidth},${point.y * overlayHeight}`)
                            .join(' ')}
                          fill="rgba(45, 212, 191, 0.18)"
                          stroke="rgba(45, 212, 191, 0.8)"
                          strokeWidth={overlayScale * 0.005}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      )}
                      {draftRoomPoints.length === 1 && (
                        <circle
                          cx={draftRoomPoints[0].x * overlayWidth}
                          cy={draftRoomPoints[0].y * overlayHeight}
                          r={overlayScale * 0.012}
                          fill="rgba(45, 212, 191, 0.8)"
                        />
                      )}
                    </svg>
                    {isOutliningRoom && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCancelRoomOutline();
                        }}
                        className="absolute left-4 top-4 rounded-full border border-rose-400/60 bg-rose-500/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-500/30"
                      >
                        Cancel Outline
                      </button>
                    )}
                    {isOutliningRoom && !isDrawingRoom && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="rounded-xl border border-teal-400/50 bg-slate-950/80 px-5 py-4 text-center text-[10px] uppercase tracking-[0.35em] text-teal-100">
                          {ROOM_TOOL_INSTRUCTIONS[selectedRoomTool]}
                        </div>
                      </div>
                    )}
                    {activeRoom && (
                      <div
                        className="pointer-events-auto absolute z-20 w-80 max-w-[90%] -translate-x-1/2 -translate-y-full rounded-2xl border border-teal-400/40 bg-slate-950/95 p-4 shadow-2xl"
                        style={containerPointToStyle(clampedActiveAnchor)}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.35em] text-teal-300">Room Details</p>
                            <h4 className="mt-1 text-sm font-semibold text-white">{activeRoom.name || 'Unnamed Area'}</h4>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleAutoSnapRoom(activeRoom.id)}
                                className="rounded-full border border-teal-400/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-100 transition hover:bg-teal-400/20"
                              >
                                Auto Snap
                              </button>
                              <button
                                type="button"
                                onClick={handleStartRoomAdjustment}
                                disabled={isAdjustingActiveRoom}
                                className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isAdjustingActiveRoom
                                    ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                                    : 'border-teal-400/40 text-teal-100 hover:bg-teal-400/20'
                                }`}
                              >
                                Adjust Boundary
                              </button>
                            </div>
                            {isAdjustingActiveRoom && (
                              <span className="text-[10px] uppercase tracking-[0.35em] text-amber-200">
                                Adjusting — drag on the map to refine
                              </span>
                            )}
                          </div>
                        </div>
                        <label className="mt-3 block text-[10px] uppercase tracking-[0.35em] text-slate-400">
                          Area Name
                          <input
                            type="text"
                            value={activeRoom.name}
                            onChange={(event) => handleRoomFieldChange(activeRoom.id, 'name', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                            placeholder="Hallway A"
                          />
                        </label>
                        <label className="mt-3 block text-[10px] uppercase tracking-[0.35em] text-slate-400">
                          Tags
                          <input
                            type="text"
                            value={activeRoom.tagsInput}
                            onChange={(event) => handleRoomFieldChange(activeRoom.id, 'tagsInput', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                            placeholder="hallway, treasure, trap"
                          />
                        </label>
                        <label className="mt-3 block text-[10px] uppercase tracking-[0.35em] text-slate-400">
                          Notes
                          <textarea
                            value={activeRoom.notes}
                            onChange={(event) => handleRoomFieldChange(activeRoom.id, 'notes', event.target.value)}
                            rows={3}
                            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                            placeholder="Hidden lever opens the passage."
                          />
                        </label>
                        <label className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-slate-400">
                          <input
                            type="checkbox"
                            checked={activeRoom.isVisible}
                            onChange={(event) => handleRoomVisibilityToggle(activeRoom.id, event.target.checked)}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-teal-400 focus:ring-teal-400"
                          />
                          Visible to players at start
                        </label>
                        <div className="mt-4 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setActiveRoomId(null)}
                            className="rounded-full border border-slate-700/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-teal-400/60 hover:text-teal-100"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                    Upload a map image to outline rooms.
                  </div>
                )}
              </div>
              <div className="flex flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70">
                <div className="border-b border-slate-800/70 p-5">
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Rooms &amp; Hallways</p>
                  <h3 className="text-lg font-semibold text-white">Manage hidden areas</h3>
                  <p className="mt-2 text-xs text-slate-500">
                    Select a region on the map to edit its details, tags, or visibility.
                  </p>
                </div>
                <div className="flex-1 space-y-3 overflow-auto p-5">
                  {rooms.map((room) => {
                    const roomTags = parseTagsInput(room.tagsInput);
                    const isActive = room.id === activeRoomId;
                    return (
                      <div
                        key={room.id}
                        className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                          isActive
                            ? 'border-teal-400/70 bg-teal-500/10 text-teal-100'
                            : 'border-slate-800/70 bg-slate-950/70 text-slate-300'
                        }`}
                      >
                        <div>
                          <button
                            type="button"
                            className="text-left text-sm font-semibold text-white hover:underline"
                            onClick={() => setActiveRoomId(room.id)}
                          >
                            {room.name || 'Unnamed Area'}
                          </button>
                          {roomTags.length > 0 && (
                            <p className="mt-1 text-[11px] uppercase tracking-[0.35em] text-slate-400">
                              Tags: {roomTags.join(', ')}
                            </p>
                          )}
                          {room.notes && <p className="mt-1 text-xs text-slate-400">{room.notes}</p>}
                          {room.isVisible && (
                            <span className="mt-2 inline-flex rounded-full border border-amber-400/60 bg-amber-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-200">
                              Visible to players
                            </span>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 text-[10px] uppercase tracking-[0.3em]">
                          <button
                            type="button"
                            onClick={() => setActiveRoomId(room.id)}
                            className="rounded-full border border-teal-400/60 px-3 py-1 text-teal-100 transition hover:bg-teal-400/20"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoom(room.id)}
                            className="rounded-full border border-rose-400/60 px-3 py-1 text-rose-200 transition hover:bg-rose-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {rooms.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 px-4 py-10 text-center text-xs text-slate-500">
                      Add rooms to control what players can see on the map.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="flex h-full flex-col">
            <div className="mb-6 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div
                ref={mapAreaRef}
                className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/70"
              >
                {previewUrl ? (
                  <>
                    <img src={previewUrl} alt="Interactive map preview" className="h-full w-full object-contain" />
                    {markers.map((marker) => (
                      <button
                        key={marker.id}
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          setDraggingId(marker.id);
                        }}
                        style={containerPointToStyle(
                          normalisedToContainerPoint({ x: marker.x, y: marker.y }, markerDisplayMetrics)
                        )}
                        className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/40 bg-slate-950/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg transition hover:border-teal-300/80 hover:text-teal-100"
                      >
                        {marker.label || 'Marker'}
                      </button>
                    ))}
                    {markers.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                        Add markers from the panel to start placing points of interest.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                    Upload a map image to place markers.
                  </div>
                )}
              </div>
              <div className="flex flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70">
                <div className="border-b border-slate-800/70 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Markers</p>
                      <h3 className="text-lg font-semibold text-white">Drag &amp; Drop Points</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddMarker}
                      className="rounded-full border border-teal-400/60 bg-teal-500/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
                    >
                      Add Marker
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Create markers and drag them directly onto the map. Use notes to capture quick reminders.
                  </p>
                </div>
                <div className="flex-1 space-y-4 overflow-auto p-5">
                  {markers.map((marker) => (
                    <div key={marker.id} className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex-1 text-[10px] uppercase tracking-[0.4em] text-slate-500">
                          Label
                          <input
                            type="text"
                            value={marker.label}
                            onChange={(event) => handleMarkerChange(marker.id, 'label', event.target.value)}
                            className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                            placeholder="Secret Door"
                          />
                        </label>
                        <label className="text-[10px] uppercase tracking-[0.4em] text-slate-500">
                          Color
                          <input
                            type="text"
                            value={marker.color}
                            onChange={(event) => handleMarkerChange(marker.id, 'color', event.target.value)}
                            className="mt-2 w-28 rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                            placeholder="#facc15"
                          />
                        </label>
                      </div>
                      <label className="mt-3 block text-[10px] uppercase tracking-[0.4em] text-slate-500">
                        Notes
                        <textarea
                          value={marker.notes}
                          onChange={(event) => handleMarkerChange(marker.id, 'notes', event.target.value)}
                          rows={2}
                          className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                          placeholder="Trap trigger, treasure cache, etc."
                        />
                      </label>
                      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-slate-500">
                        <span>
                          Position: {Math.round(marker.x * 100)}% × {Math.round(marker.y * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMarker(marker.id)}
                          className="rounded-full border border-rose-400/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-400/20"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  {markers.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 px-4 py-10 text-center text-xs text-slate-500">
                      No markers yet. Add a marker to start placing points of interest.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="border-t border-slate-800/70 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border border-slate-700/70 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-teal-400/60 hover:text-teal-200"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex flex-wrap items-center gap-4">
            {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
            {step < steps.length - 1 ? (
              <button
                type="button"
                disabled={!allowNext}
                onClick={handleContinue}
                className={`rounded-full border px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                  allowNext
                    ? 'border-teal-400/60 bg-teal-500/80 text-slate-900 hover:bg-teal-400/90'
                    : 'cursor-not-allowed border-slate-800/70 bg-slate-900/70 text-slate-500'
                }`}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={creating}
                className={`rounded-full border px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                  creating
                    ? 'cursor-wait border-slate-800/70 bg-slate-900/70 text-slate-500'
                    : 'border-teal-400/60 bg-teal-500/80 text-slate-900 hover:bg-teal-400/90'
                }`}
              >
                {creating ? 'Creating…' : 'Create Map'}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MapCreationWizard;
