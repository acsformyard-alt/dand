import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DefineRoom,
  type DefineRoomData,
  type DefineRoomMarker,
} from '../define-rooms/DefineRoom';
import '../define-rooms/styles.css';
import { apiClient } from '../api/client';
import {
  computeDisplayMetrics,
  type ImageDisplayMetrics,
} from '../utils/imageProcessing';
import { roomMaskToPolygon, type RoomMask } from '../utils/roomMask';
import type { Campaign, MapRecord, Marker, Region } from '../types';
import {
  getMapMarkerIconDefinition,
  mapMarkerIconDefinitions,
  type MapMarkerIconDefinition,
} from './mapMarkerIcons';

type WizardStep = 0 | 1 | 2 | 3;

interface MapCreationWizardProps {
  campaign: Campaign;
  onClose: () => void;
  onComplete: (map: MapRecord, markers: Marker[], regions: Region[]) => void;
}

type DraftMarkerKind = 'point' | 'area';
type DraftMarkerAreaShape = 'circle' | 'lasso' | null;

interface DraftMarker {
  id: string;
  label: string;
  color: string;
  notes: string;
  x: number;
  y: number;
  iconKey: string | null;
  kind: DraftMarkerKind;
  areaShape: DraftMarkerAreaShape;
  areaCenter: { x: number; y: number } | null;
  areaRadius: number | null;
  areaPoints: Array<{ x: number; y: number }>;
  linkedRoomId: string | null;
  linkedRoomIdSource: 'auto' | 'manual';
}

type CircleCaptureState = {
  type: 'circle';
  markerId: string;
  pointerId: number | null;
  center: { x: number; y: number } | null;
  original: {
    center: DraftMarker['areaCenter'];
    radius: DraftMarker['areaRadius'];
    x: number;
    y: number;
  };
};

type LassoCaptureState = {
  type: 'lasso';
  markerId: string;
};

type AreaCaptureState = CircleCaptureState | LassoCaptureState;

interface DraftRoom {
  id: string;
  name: string;
  description: string;
  tags: string;
  visibleAtStart: boolean;
  mask: RoomMask | null;
  color: string;
}

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
    description: 'Use the room editor to outline areas before placing your markers.',
  },
  {
    title: 'Add Markers',
    description: 'Place markers to highlight important characters, objects, or areas.',
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const resolveNormalizedPointWithinImage = (
  event: { clientX: number; clientY: number },
  container: HTMLDivElement | null,
  imageDimensions: { width: number; height: number } | null,
  metricsOverride?: ImageDisplayMetrics | null,
) => {
  if (!container || !imageDimensions) return null;
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const metrics =
    metricsOverride ??
    computeDisplayMetrics(
      rect.width,
      rect.height,
      imageDimensions.width,
      imageDimensions.height,
    );
  const relativeX = clamp(
    event.clientX - rect.left - metrics.offsetX,
    0,
    metrics.displayWidth,
  );
  const relativeY = clamp(
    event.clientY - rect.top - metrics.offsetY,
    0,
    metrics.displayHeight,
  );
  const normalisedX = metrics.displayWidth === 0 ? 0 : relativeX / metrics.displayWidth;
  const normalisedY = metrics.displayHeight === 0 ? 0 : relativeY / metrics.displayHeight;
  return { x: normalisedX, y: normalisedY };
};

const useImageDisplayMetrics = (
  ref: React.RefObject<HTMLDivElement>,
  imageDimensions: { width: number; height: number } | null,
) => {
  const [metrics, setMetrics] = useState<ImageDisplayMetrics | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !imageDimensions) {
      setMetrics(null);
      return undefined;
    }

    let animationFrame: number | null = null;

    const update = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      setMetrics(
        computeDisplayMetrics(
          rect.width,
          rect.height,
          imageDimensions.width,
          imageDimensions.height,
        ),
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
      if (animationFrame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [ref, imageDimensions]);

  return metrics;
};

const normalisedToContainerPoint = (
  point: { x: number; y: number },
  metrics: ImageDisplayMetrics | null,
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

const parseTagsInput = (input: string) =>
  input
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

const applyAlphaToColor = (color: string, alpha: number) => {
  const trimmed = color.trim();
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) {
    return trimmed;
  }
  let hex = hexMatch[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
};

const computeCircleRadius = (
  center: { x: number; y: number },
  edge: { x: number; y: number },
  dimensions: { width: number; height: number } | null,
) => {
  if (!dimensions || dimensions.width === 0 || dimensions.height === 0) {
    const dx = edge.x - center.x;
    const dy = edge.y - center.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const aspect = dimensions.height / dimensions.width;
  const dx = edge.x - center.x;
  const dy = (edge.y - center.y) * aspect;
  return Math.sqrt(dx * dx + dy * dy);
};

const computePolygonCentroid = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return { x: 0.5, y: 0.5 };
  }
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    area += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-6) {
    const sum = points.reduce(
      (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
      { x: 0, y: 0 },
    );
    return { x: sum.x / points.length, y: sum.y / points.length };
  }
  const centroid = {
    x: cx / (6 * area),
    y: cy / (6 * area),
  };
  return {
    x: clamp(centroid.x, 0, 1),
    y: clamp(centroid.y, 0, 1),
  };
};

const isPointInPolygon = (
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
) => {
  if (polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y;
    if (intersects) {
      const slope = (xj - xi) / (yj - yi + Number.EPSILON);
      const xIntersection = slope * (point.y - yi) + xi;
      if (point.x < xIntersection) {
        inside = !inside;
      }
    }
  }
  return inside;
};

const deriveMarkerReferencePoint = (marker: DraftMarker) => {
  if (marker.kind === 'area') {
    if (marker.areaCenter) {
      return marker.areaCenter;
    }
    if (marker.areaPoints.length >= 3) {
      return computePolygonCentroid(marker.areaPoints);
    }
  }
  return { x: marker.x, y: marker.y };
};

const describeRoomCategory = (room: DraftRoom) => {
  const tags = (room.tags || '').toLowerCase();
  const name = room.name.toLowerCase();
  if (tags.includes('hall') || name.includes('hall')) {
    return 'Hallway';
  }
  return 'Room';
};

type MarkerIconBadgeSize = 'sm' | 'md' | 'lg';

const markerIconBadgeSizeClasses: Record<MarkerIconBadgeSize, string> = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

const markerIconBadgeIconSizeClasses: Record<MarkerIconBadgeSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

const MarkerIconBadge: React.FC<{
  definition?: MapMarkerIconDefinition;
  color: string;
  size?: MarkerIconBadgeSize;
  className?: string;
  fallbackLabel?: string;
}> = ({ definition, color, size = 'md', className = '', fallbackLabel }) => {
  const sizeClassName = markerIconBadgeSizeClasses[size];
  const iconSizeClassName = markerIconBadgeIconSizeClasses[size];
  const fallbackText =
    (fallbackLabel?.trim().charAt(0)?.toUpperCase() ?? '') || '?';
  const iconElement = definition
    ? React.cloneElement(definition.icon, {
        className: iconSizeClassName,
      })
    : (
        <span className="font-semibold uppercase leading-none">{fallbackText}</span>
      );

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border text-slate-950 ${sizeClassName} ${className}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      <span className="pointer-events-none">{iconElement}</span>
    </span>
  );
};

const createRoomMaskFromBinary = (
  mask: Uint8Array,
  width: number,
  height: number,
): RoomMask | null => {
  if (!mask || mask.length === 0 || width === 0 || height === 0) {
    return null;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const maskWidth = maxX - minX + 1;
  const maskHeight = maxY - minY + 1;
  const data = new Uint8ClampedArray(maskWidth * maskHeight);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const sourceIndex = y * width + x;
      const targetIndex = (y - minY) * maskWidth + (x - minX);
      data[targetIndex] = mask[sourceIndex] ? 255 : 0;
    }
  }

  return {
    width: maskWidth,
    height: maskHeight,
    bounds: {
      minX: minX / width,
      minY: minY / height,
      maxX: (maxX + 1) / width,
      maxY: (maxY + 1) / height,
    },
    data,
  };
};

const summariseRooms = (
  rooms: DefineRoomData[],
  dimensions: { width: number; height: number },
): DraftRoom[] => {
  const { width, height } = dimensions;
  if (!width || !height) {
    return [];
  }

  return rooms
    .filter((room) => room.isConfirmed)
    .map((room) => ({
      id: room.id,
      name: room.name?.trim() || 'Room',
      description: room.description ?? '',
      tags: room.tags ?? '',
      visibleAtStart: room.visibleAtStart,
      color: room.color,
      mask: createRoomMaskFromBinary(room.mask, width, height),
    }));
};

const summariseMarkers = (
  markers: DefineRoomMarker[],
  dimensions: { width: number; height: number },
): DraftMarker[] => {
  const { width, height } = dimensions;
  if (!width || !height) {
    return [];
  }

  const widthDenominator = Math.max(1, width - 1);
  const heightDenominator = Math.max(1, height - 1);

  return markers.map((marker, index) => {
    const definition = getMapMarkerIconDefinition(marker.type);
    const trimmedName = marker.name.trim();
    const label = trimmedName || definition?.label || `Marker ${index + 1}`;
    const trimmedDescription = marker.description.trim();
    const trimmedTags = marker.tags.trim();
    const notesSections: string[] = [];
    if (trimmedDescription) {
      notesSections.push(trimmedDescription);
    }
    if (trimmedTags) {
      notesSections.push(`Tags: ${trimmedTags}`);
    }
    if (marker.visibleAtStart) {
      notesSections.push('Visible upon room entry');
    }

    const draft: DraftMarker = {
      id: marker.id,
      label,
      color: definition?.defaultColor ?? '#facc15',
      notes: notesSections.join('\n\n'),
      x: clamp(marker.x / widthDenominator, 0, 1),
      y: clamp(marker.y / heightDenominator, 0, 1),
      iconKey: definition?.key ?? null,
      kind: definition?.kind ?? 'point',
      areaShape: null,
      areaCenter: null,
      areaRadius: null,
      areaPoints: [],
      linkedRoomId: marker.linkedRoomId,
      linkedRoomIdSource: 'auto',
    };

    return draft;
  });
};

const MapCreationWizard: React.FC<MapCreationWizardProps> = ({
  campaign,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = useState<WizardStep>(0);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [grouping, setGrouping] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markers, setMarkers] = useState<DraftMarker[]>([]);
  const [expandedMarkerId, setExpandedMarkerId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [definedRooms, setDefinedRooms] = useState<DraftRoom[]>([]);
  const [defineRoomContainer, setDefineRoomContainer] = useState<HTMLDivElement | null>(null);
  const [markerPaletteOpen, setMarkerPaletteOpen] = useState(false);
  const [activeIconPickerId, setActiveIconPickerId] = useState<string | null>(null);
  const [areaCapture, setAreaCapture] = useState<AreaCaptureState | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defineRoomRef = useRef<DefineRoom | null>(null);
  const defineRoomImageRef = useRef<HTMLImageElement | null>(null);
  const stepRef = useRef(step);
  const brushSliderHostRef = useRef<HTMLDivElement | null>(null);
  const markerPaletteRef = useRef<HTMLDivElement | null>(null);
  const iconPickerDropdownRef = useRef<HTMLDivElement | null>(null);
  const [defineRoomReady, setDefineRoomReady] = useState(false);
  const defineRoomContainerRef = useCallback((node: HTMLDivElement | null) => {
    setDefineRoomContainer(node);
  }, []);

  const roomPolygonById = useMemo(() => {
    const polygons = new Map<string, Array<{ x: number; y: number }>>();
    for (const room of definedRooms) {
      if (!room.mask) {
        continue;
      }
      const polygon = roomMaskToPolygon(room.mask);
      if (polygon.length >= 3) {
        polygons.set(room.id, polygon);
      }
    }
    return polygons;
  }, [definedRooms]);

  const findContainingRoomId = useCallback(
    (point: { x: number; y: number } | null) => {
      if (!point) {
        return null;
      }
      for (const [roomId, polygon] of roomPolygonById) {
        if (isPointInPolygon(point, polygon)) {
          return roomId;
        }
      }
      return null;
    },
    [roomPolygonById],
  );

  const applyAutoAssociation = useCallback(
    (marker: DraftMarker, pointOverride?: { x: number; y: number } | null): DraftMarker => {
      if (marker.linkedRoomIdSource === 'manual') {
        return marker;
      }
      const referencePoint = pointOverride ?? deriveMarkerReferencePoint(marker);
      const nextLinkedRoomId = findContainingRoomId(referencePoint);
      if (nextLinkedRoomId === marker.linkedRoomId && marker.linkedRoomIdSource === 'auto') {
        return marker;
      }
      if (nextLinkedRoomId === marker.linkedRoomId && marker.linkedRoomIdSource !== 'auto') {
        return { ...marker, linkedRoomIdSource: 'auto' };
      }
      return {
        ...marker,
        linkedRoomId: nextLinkedRoomId,
        linkedRoomIdSource: 'auto',
      };
    },
    [findContainingRoomId],
  );

  const updateMarkerWithAssociation = useCallback(
    (
      marker: DraftMarker,
      updates: Partial<DraftMarker>,
      pointOverride?: { x: number; y: number } | null,
    ): DraftMarker => {
      const merged = { ...marker, ...updates };
      return applyAutoAssociation(merged, pointOverride);
    },
    [applyAutoAssociation],
  );

  useEffect(() => {
    setMarkers((current) => {
      let changed = false;
      const next = current.map((marker) => {
        const updated = applyAutoAssociation(marker);
        if (updated !== marker) {
          changed = true;
        }
        return updated;
      });
      return changed ? next : current;
    });
  }, [applyAutoAssociation]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  const syncRoomsFromEditor = useCallback(() => {
    const instance = defineRoomRef.current;
    if (!instance) {
      setDefinedRooms([]);
      return;
    }
    const dimensions = instance.getImageDimensions();
    if (!dimensions.width || !dimensions.height) {
      setDefinedRooms([]);
      return;
    }
    const rooms = summariseRooms(instance.getRooms(), dimensions);
    setDefinedRooms(rooms);
  }, []);

  const syncMarkersFromEditor = useCallback(
    (options?: { updateState?: boolean }) => {
      const shouldUpdateState = options?.updateState ?? true;
      const instance = defineRoomRef.current;
      if (!instance) {
        if (shouldUpdateState) {
          setMarkers([]);
        }
        return [] as DraftMarker[];
      }
      const dimensions = instance.getImageDimensions();
      if (!dimensions.width || !dimensions.height) {
        if (shouldUpdateState) {
          setMarkers([]);
        }
        return [] as DraftMarker[];
      }
      const nextMarkers = summariseMarkers(instance.getMarkers(), dimensions);
      if (shouldUpdateState) {
        setMarkers(nextMarkers);
      }
      return nextMarkers;
    },
    [setMarkers],
  );

  useEffect(() => {
    const editor = new DefineRoom({ mode: 'embedded' });
    defineRoomRef.current = editor;
    setDefineRoomReady(true);

    const originalClose = editor.close.bind(editor);
    (editor as unknown as { close: () => void }).close = () => {
      syncRoomsFromEditor();
      syncMarkersFromEditor();
      originalClose();
    };

    return () => {
      (editor as unknown as { close: () => void }).close = originalClose;
      editor.destroy();
      defineRoomRef.current = null;
      defineRoomImageRef.current = null;
      setDefineRoomReady(false);
    };
  }, [syncMarkersFromEditor, syncRoomsFromEditor]);

  useEffect(() => {
    const editor = defineRoomRef.current;
    const container = defineRoomContainer;
    if (!editor || !container) {
      return undefined;
    }
    if (!container.contains(editor.element)) {
      editor.mount(container);
    }
    return () => {
      if (container.contains(editor.element)) {
        container.removeChild(editor.element);
      }
    };
  }, [defineRoomContainer]);

  useEffect(() => {
    if (!defineRoomReady || step !== 2) {
      return undefined;
    }

    const editor = defineRoomRef.current;
    const sliderHost = brushSliderHostRef.current;
    if (!editor || !sliderHost) {
      return undefined;
    }

    const slider = editor.element.querySelector('.brush-slider-container');
    if (!(slider instanceof HTMLElement)) {
      return undefined;
    }

    const originalParent = slider.parentElement;
    if (!originalParent || sliderHost.contains(slider)) {
      return undefined;
    }

    const dockedClass = 'brush-slider-container--docked-left';
    slider.classList.add(dockedClass);
    sliderHost.appendChild(slider);

    return () => {
      slider.classList.remove(dockedClass);
      if (!originalParent.contains(slider)) {
        originalParent.appendChild(slider);
      }
    };
  }, [defineRoomReady, step]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setImageDimensions(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const image = new Image();
    image.onload = () => {
      setImageDimensions({ width: image.width, height: image.height });
    };
    image.src = objectUrl;

    return () => {
      URL.revokeObjectURL(objectUrl);
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
    if (!defineRoomReady) {
      return;
    }
    if (!previewUrl) {
      defineRoomRef.current?.close();
      defineRoomImageRef.current = null;
      setDefinedRooms([]);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) {
        return;
      }
      defineRoomImageRef.current = image;
      defineRoomRef.current?.loadImage(image);
      setDefinedRooms([]);
      const currentStep = stepRef.current;
      if (currentStep === 2 || currentStep === 3) {
        defineRoomRef.current?.setMarkerPlacementMode(false);
        defineRoomRef.current?.open(image, { resetExisting: true });
      } else {
        defineRoomRef.current?.close();
      }
    };
    image.src = previewUrl;

    return () => {
      cancelled = true;
    };
  }, [defineRoomReady, previewUrl]);

  useEffect(() => {
    if (!defineRoomReady) {
      return;
    }
    const editor = defineRoomRef.current;
    if (!editor) {
      return;
    }
    if ((step === 2 || step === 3) && defineRoomImageRef.current) {
      editor.setMarkerPlacementMode(false);
      editor.open(defineRoomImageRef.current, { resetExisting: false });
    } else {
      editor.setMarkerPlacementMode(false);
      editor.close();
    }
  }, [defineRoomReady, step]);

  useEffect(() => {
    if (!defineRoomReady) {
      return;
    }
    const editor = defineRoomRef.current;
    if (!editor) {
      return;
    }
    if (step === 2) {
      editor.setActiveTab('rooms');
    }
    if (step === 3) {
      editor.setActiveTab('markers');
    }
  }, [defineRoomReady, step]);

  useEffect(() => {
    if (!markerPaletteOpen) {
      return undefined;
    }
    const handleClickAway = (event: MouseEvent) => {
      if (!markerPaletteRef.current) {
        return;
      }
      if (!markerPaletteRef.current.contains(event.target as Node)) {
        setMarkerPaletteOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMarkerPaletteOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickAway);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickAway);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [markerPaletteOpen]);

  useEffect(() => {
    if (!activeIconPickerId) {
      iconPickerDropdownRef.current = null;
      return undefined;
    }

    const handleClickAway = (event: MouseEvent) => {
      if (!iconPickerDropdownRef.current) {
        return;
      }
      if (!iconPickerDropdownRef.current.contains(event.target as Node)) {
        setActiveIconPickerId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveIconPickerId(null);
      }
    };

    window.addEventListener('mousedown', handleClickAway);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickAway);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeIconPickerId]);

  const markerDisplayMetrics = useImageDisplayMetrics(mapAreaRef, imageDimensions);

  useEffect(() => {
    if (!draggingId || areaCapture) return;

    const handlePointerMove = (event: PointerEvent) => {
      const point = resolveNormalizedPointWithinImage(
        event,
        mapAreaRef.current,
        imageDimensions,
        markerDisplayMetrics,
      );
      if (!point) return;
      setMarkers((current) =>
        current.map((marker) => {
          if (marker.id !== draggingId) {
            return marker;
          }
          if (marker.kind === 'point') {
            return updateMarkerWithAssociation(
              marker,
              { x: point.x, y: point.y },
              point,
            );
          }
          if (marker.kind === 'area' && marker.areaShape === 'circle') {
            return updateMarkerWithAssociation(
              marker,
              {
                x: point.x,
                y: point.y,
                areaCenter: { x: point.x, y: point.y },
              },
              point,
            );
          }
          return marker;
        }),
      );
    };

    const markerId = draggingId;

    const handlePointerUp = () => {
      if (markerId) {
        setMarkers((current) =>
          current.map((marker) =>
            marker.id === markerId ? applyAutoAssociation(marker) : marker,
          ),
        );
      }
      setDraggingId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    draggingId,
    imageDimensions,
    markerDisplayMetrics,
    areaCapture,
    updateMarkerWithAssociation,
    applyAutoAssociation,
  ]);

  useEffect(() => {
    if (markers.length === 0) {
      if (expandedMarkerId !== null) {
        setExpandedMarkerId(null);
      }
      return;
    }

    if (!markers.some((marker) => marker.id === expandedMarkerId)) {
      setExpandedMarkerId(markers[markers.length - 1].id);
    }
  }, [markers, expandedMarkerId]);

  useEffect(() => {
    if (!expandedMarkerId) {
      setActiveIconPickerId(null);
      return;
    }
    setActiveIconPickerId((current) => (current === expandedMarkerId ? current : null));
  }, [expandedMarkerId]);

  useEffect(() => {
    if (activeIconPickerId && !markers.some((marker) => marker.id === activeIconPickerId)) {
      setActiveIconPickerId(null);
    }
  }, [activeIconPickerId, markers]);

  const allowNext = useMemo(() => {
    if (step === 0) {
      return !!file;
    }
    if (step === 1) {
      return name.trim().length > 0;
    }
    return true;
  }, [file, name, step]);

  const tags = useMemo(() => parseTagsInput(tagsInput), [tagsInput]);

  const canLaunchRoomsEditor = defineRoomReady && Boolean(defineRoomImageRef.current);
  const pointMarkers = useMemo(
    () => markers.filter((marker) => marker.kind === 'point'),
    [markers],
  );
  const areaMarkers = useMemo(
    () => markers.filter((marker) => marker.kind === 'area'),
    [markers],
  );

  const handleFileSelected = useCallback((selected: File) => {
    setFile(selected);
    setMarkers([]);
    setExpandedMarkerId(null);
    setDefinedRooms([]);
    defineRoomRef.current?.close();
    defineRoomImageRef.current = null;
  }, []);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setError(null);
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      handleFileSelected(droppedFile);
    }
  };

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleMarkerChange = (markerId: string, field: keyof DraftMarker, value: unknown) => {
    setMarkers((current) =>
      current.map((marker) => {
        if (marker.id !== markerId) {
          return marker;
        }

        const nextMarker: DraftMarker = { ...marker };

        if (field === 'x' || field === 'y') {
          const numericValue =
            typeof value === 'number'
              ? value
              : typeof value === 'string'
              ? Number(value)
              : Number.NaN;
          if (Number.isFinite(numericValue)) {
            nextMarker[field] = numericValue;
          }
          return nextMarker;
        }

        if (field === 'areaRadius') {
          const numericValue =
            typeof value === 'number'
              ? value
              : typeof value === 'string'
              ? Number(value)
              : Number.NaN;
          nextMarker.areaRadius = Number.isFinite(numericValue) ? numericValue : nextMarker.areaRadius;
          return nextMarker;
        }

        if (field === 'areaCenter') {
          if (value === null) {
            nextMarker.areaCenter = null;
            return nextMarker;
          }
          if (typeof value === 'object' && value) {
            const candidate = value as { x?: number; y?: number };
            const xValue = Number(candidate.x);
            const yValue = Number(candidate.y);
            if (Number.isFinite(xValue) && Number.isFinite(yValue)) {
              nextMarker.areaCenter = { x: xValue, y: yValue };
            }
          }
          return nextMarker;
        }

        if (field === 'areaPoints') {
          if (Array.isArray(value)) {
            nextMarker.areaPoints = value
              .map((point) => ({
                x: Number((point as { x?: number }).x ?? 0),
                y: Number((point as { y?: number }).y ?? 0),
              }))
              .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
          }
          return nextMarker;
        }

        (nextMarker as Record<keyof DraftMarker, unknown>)[field] = value as DraftMarker[typeof field];
        return nextMarker;
      }),
    );
  };

  const handleMarkerIconChange = (
    markerId: string,
    definition: MapMarkerIconDefinition,
  ) => {
    setMarkers((current) =>
      current.map((marker) => {
        if (marker.id !== markerId) {
          return marker;
        }

        if (marker.kind !== definition.kind) {
          return marker;
        }

        const previousDefinition = getMapMarkerIconDefinition(marker.iconKey);
        const nextMarker: DraftMarker = { ...marker, iconKey: definition.key };

        const currentColor = (marker.color || '').trim().toLowerCase();
        const previousDefaultColor = (previousDefinition?.defaultColor || '')
          .trim()
          .toLowerCase();

        if (!marker.color.trim()) {
          nextMarker.color = definition.defaultColor;
        } else if (previousDefaultColor && currentColor === previousDefaultColor) {
          nextMarker.color = definition.defaultColor;
        }

        return nextMarker;
      }),
    );
  };

  const handleMarkerAssociationChange = (markerId: string, value: string) => {
    if (value === 'auto') {
      setMarkers((current) =>
        current.map((marker) => {
          if (marker.id !== markerId) {
            return marker;
          }
          const resetMarker =
            marker.linkedRoomIdSource === 'auto'
              ? marker
              : { ...marker, linkedRoomIdSource: 'auto' as const };
          return applyAutoAssociation(resetMarker);
        }),
      );
      return;
    }

    if (value === 'unassigned') {
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === markerId
            ? {
                ...marker,
                linkedRoomId: null,
                linkedRoomIdSource: 'manual',
              }
            : marker,
        ),
      );
      return;
    }

    if (value.startsWith('room:')) {
      const roomId = value.slice(5);
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === markerId
            ? {
                ...marker,
                linkedRoomId: roomId,
                linkedRoomIdSource: 'manual',
              }
            : marker,
        ),
      );
    }
  };

  const beginCircleCapture = useCallback(
    (marker: DraftMarker) => {
      setAreaCapture({
        type: 'circle',
        markerId: marker.id,
        pointerId: null,
        center: null,
        original: {
          center: marker.areaCenter,
          radius: marker.areaRadius,
          x: marker.x,
          y: marker.y,
        },
      });
      setExpandedMarkerId(marker.id);
    },
    [setExpandedMarkerId],
  );

  const beginLassoCapture = useCallback(
    async (marker: DraftMarker) => {
      const editor = defineRoomRef.current;
      if (!editor) {
        return;
      }
      setExpandedMarkerId(marker.id);
      setAreaCapture({ type: 'lasso', markerId: marker.id });
      try {
        const polygon = await editor.capturePolygonForMarker();
        if (!polygon || polygon.length < 3) {
          return;
        }
        const centroid = computePolygonCentroid(polygon);
        setMarkers((current) =>
          current.map((entry) =>
            entry.id === marker.id
              ? updateMarkerWithAssociation(
                  entry,
                  {
                    areaShape: 'lasso',
                    areaPoints: polygon,
                    areaRadius: null,
                    areaCenter: centroid,
                    x: centroid.x,
                    y: centroid.y,
                  },
                  centroid,
                )
              : entry,
          ),
        );
      } finally {
        setAreaCapture((current) =>
          current && current.type === 'lasso' && current.markerId === marker.id
            ? null
            : current,
        );
      }
    },
    [setExpandedMarkerId, setMarkers],
  );

  const handleMapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const capture = areaCapture;
    if (!capture || capture.type !== 'circle' || capture.pointerId !== null) {
      return;
    }
    const point = resolveNormalizedPointWithinImage(
      event.nativeEvent,
      mapAreaRef.current,
      imageDimensions,
      markerDisplayMetrics,
    );
    if (!point) {
      return;
    }
    event.preventDefault();
    setAreaCapture((current) => {
      if (!current || current.type !== 'circle' || current.markerId !== capture.markerId) {
        return current;
      }
      return { ...current, pointerId: event.pointerId, center: point };
    });
    setMarkers((current) =>
      current.map((marker) =>
        marker.id === capture.markerId
          ? updateMarkerWithAssociation(
              marker,
              {
                areaCenter: point,
                areaRadius: 0,
                x: point.x,
                y: point.y,
              },
              point,
            )
          : marker,
      ),
    );
  };

  useEffect(() => {
    if (!areaCapture || areaCapture.type !== 'circle') {
      return;
    }
    const { pointerId, center, markerId } = areaCapture;
    if (pointerId === null || !center) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      const point = resolveNormalizedPointWithinImage(
        event,
        mapAreaRef.current,
        imageDimensions,
        markerDisplayMetrics,
      );
      if (!point) {
        return;
      }
      const radius = computeCircleRadius(center, point, imageDimensions);
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === markerId
            ? updateMarkerWithAssociation(
                marker,
                {
                  areaCenter: center,
                  areaRadius: radius,
                  x: center.x,
                  y: center.y,
                },
                center,
              )
            : marker,
        ),
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) {
        return;
      }
      const point = resolveNormalizedPointWithinImage(
        event,
        mapAreaRef.current,
        imageDimensions,
        markerDisplayMetrics,
      );
      let radius = 0;
      if (point) {
        radius = computeCircleRadius(center, point, imageDimensions);
      }
      const minimumRadius = 0.02;
      const finalRadius = Number.isFinite(radius) && radius > minimumRadius ? radius : 0.08;
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === markerId
            ? applyAutoAssociation(
                {
                  ...marker,
                  areaCenter: center,
                  areaRadius: finalRadius,
                  x: center.x,
                  y: center.y,
                },
                center,
              )
            : marker,
        ),
      );
      setAreaCapture((current) =>
        current && current.type === 'circle' && current.markerId === markerId
          ? null
          : current,
      );
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    areaCapture,
    imageDimensions,
    markerDisplayMetrics,
    updateMarkerWithAssociation,
    applyAutoAssociation,
  ]);

  useEffect(() => {
    if (!areaCapture) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      if (areaCapture.type === 'lasso') {
        defineRoomRef.current?.cancelMarkerPolygonCapture();
        setAreaCapture(null);
        return;
      }
      if (areaCapture.type === 'circle') {
        const { markerId, original } = areaCapture;
        setMarkers((current) =>
          current.map((marker) =>
            marker.id === markerId
              ? applyAutoAssociation(
                  {
                    ...marker,
                    areaCenter: original.center,
                    areaRadius: original.radius,
                    x: original.x,
                    y: original.y,
                  },
                  original.center,
                )
              : marker,
          ),
        );
        setAreaCapture(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [areaCapture, setMarkers, applyAutoAssociation]);

  useEffect(() => {
    if (!areaCapture) {
      return;
    }
    if (areaCapture.type === 'lasso') {
      defineRoomRef.current?.cancelMarkerPolygonCapture();
    }
    if (areaCapture.type === 'circle') {
      const { markerId, original } = areaCapture;
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === markerId
            ? applyAutoAssociation(
                {
                  ...marker,
                  areaCenter: original.center,
                  areaRadius: original.radius,
                  x: original.x,
                  y: original.y,
                },
                original.center,
              )
            : marker,
        ),
      );
    }
    setAreaCapture(null);
  }, [areaCapture, setMarkers, applyAutoAssociation]);

  useEffect(() => {
    if (!areaCapture || previewUrl) {
      return;
    }
    if (areaCapture.type === 'lasso') {
      defineRoomRef.current?.cancelMarkerPolygonCapture();
    }
    if (areaCapture.type === 'circle') {
      const { markerId, original } = areaCapture;
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === markerId
            ? {
                ...marker,
                areaCenter: original.center,
                areaRadius: original.radius,
                x: original.x,
                y: original.y,
              }
            : marker,
        ),
      );
    }
    setAreaCapture(null);
  }, [areaCapture, previewUrl, setMarkers]);


  const handleChangeBoundary = useCallback(
    (marker: DraftMarker) => {
      if (marker.kind !== 'area') {
        return;
      }
      if (areaCapture) {
        if (areaCapture.markerId === marker.id) {
          return;
        }
        if (areaCapture.type === 'lasso') {
          defineRoomRef.current?.cancelMarkerPolygonCapture();
        }
        if (areaCapture.type === 'circle') {
          const { markerId: activeId, original } = areaCapture;
          setMarkers((current) =>
            current.map((entry) =>
              entry.id === activeId
                ? {
                    ...entry,
                    areaCenter: original.center,
                    areaRadius: original.radius,
                    x: original.x,
                    y: original.y,
                  }
                : entry,
            ),
          );
        }
        setAreaCapture(null);
      }
      if (marker.areaShape === 'lasso') {
        void beginLassoCapture(marker);
        return;
      }
      beginCircleCapture(marker);
    },
    [areaCapture, beginCircleCapture, beginLassoCapture, setMarkers],
  );


  const handleRemoveMarker = (markerId: string) => {
    if (areaCapture && areaCapture.markerId === markerId) {
      if (areaCapture.type === 'lasso') {
        defineRoomRef.current?.cancelMarkerPolygonCapture();
      }
      setAreaCapture(null);
    }
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setExpandedMarkerId((current) => (current === markerId ? null : current));
  };

  const promptAreaMarkerShape = (): DraftMarkerAreaShape => {
    if (typeof window === 'undefined') {
      return 'circle';
    }
    const useCircle = window.confirm(
      'Create a circular area marker? Click “Cancel” to start with a freeform (lasso) outline.',
    );
    return useCircle ? 'circle' : 'lasso';
  };

  const handleAddMarker = (definition: MapMarkerIconDefinition) => {
    const areaShape = definition.kind === 'area' ? promptAreaMarkerShape() : null;
    let createdMarker: DraftMarker | null = null;
    setMarkers((current) => {
      const nextIndex = current.length + 1;
      const id = `draft-${Date.now()}-${nextIndex}`;
      const labelBase = definition.label.replace(/ Marker$/, '');
      const label = `${labelBase} ${nextIndex}`.trim();
      const marker: DraftMarker = {
        id,
        label,
        color: definition.defaultColor,
        notes: '',
        x: 0.5,
        y: 0.5,
        iconKey: definition.key,
        kind: definition.kind,
        areaShape,
        areaCenter:
          definition.kind === 'area' && areaShape === 'circle'
            ? { x: 0.5, y: 0.5 }
            : null,
        areaRadius:
          definition.kind === 'area' && areaShape === 'circle'
            ? 0.2
            : null,
        areaPoints:
          definition.kind === 'area' && areaShape === 'lasso'
            ? []
            : [],
        linkedRoomId: null,
        linkedRoomIdSource: 'auto',
      };
      const autoAssociated = applyAutoAssociation(marker, { x: marker.x, y: marker.y });
      createdMarker = autoAssociated;
      return [...current, autoAssociated];
    });
    if (createdMarker) {
      setExpandedMarkerId(createdMarker.id);
      if (createdMarker.kind === 'area') {
        if (createdMarker.areaShape === 'circle') {
          beginCircleCapture(createdMarker);
        } else if (createdMarker.areaShape === 'lasso') {
          void beginLassoCapture(createdMarker);
        }
      }
    }
  };

  const handleSelectMarkerTemplate = (definition: MapMarkerIconDefinition) => {
    handleAddMarker(definition);
    setMarkerPaletteOpen(false);
  };

  const handleContinue = () => {
    if (step === 2) {
      syncRoomsFromEditor();
      syncMarkersFromEditor();
    }
    if (step < steps.length - 1) {
      setStep((current) => (current + 1) as WizardStep);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onClose();
      return;
    }
    if (step === 2) {
      syncRoomsFromEditor();
      syncMarkersFromEditor();
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
    syncRoomsFromEditor();
    const editorMarkers = syncMarkersFromEditor({ updateState: false });
    const markersById = new Map<string, DraftMarker>();
    editorMarkers.forEach((marker) => {
      markersById.set(marker.id, marker);
    });
    markers.forEach((marker) => {
      markersById.set(marker.id, marker);
    });
    const markersForSubmission = Array.from(markersById.values());
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

      const createdRegions: Region[] = [];
      const regionIdByDraftId = new Map<string, string>();
      for (const [index, room] of definedRooms.entries()) {
        if (!room.mask) {
          continue;
        }
        const notesSections: string[] = [];
        const trimmedDescription = room.description.trim();
        const trimmedTags = room.tags.trim();
        if (trimmedDescription) {
          notesSections.push(trimmedDescription);
        }
        if (trimmedTags) {
          notesSections.push(`Tags: ${trimmedTags}`);
        }
        if (room.visibleAtStart) {
          notesSections.push('Visible at start of session');
        }
        const notesValue = notesSections.length > 0 ? notesSections.join('\n\n') : undefined;
        const colorValue = room.color.trim();
        const region = await apiClient.createRegion(map.id, {
          name: room.name.trim() || `Room ${index + 1}`,
          mask: room.mask,
          notes: notesValue,
          revealOrder: room.visibleAtStart ? index : undefined,
          color: colorValue ? colorValue.toLowerCase() : undefined,
        });
        regionIdByDraftId.set(room.id, region.id);
        createdRegions.push(region);
      }

      const createdMarkers: Marker[] = [];
      const resolvedMarkers = markersForSubmission.map((marker) =>
        marker.linkedRoomIdSource === 'auto' ? applyAutoAssociation(marker) : marker,
      );
      for (const marker of resolvedMarkers) {
        let geometry: {
          kind: 'point' | 'area';
          areaShape?: 'circle' | 'polygon';
          circle?: { center: { x: number; y: number }; radius: number };
          polygon?: Array<{ x: number; y: number }>;
        } = { kind: marker.kind === 'area' ? 'area' : 'point' };

        if (geometry.kind === 'area') {
          if (marker.areaShape === 'circle' && marker.areaCenter) {
            const radius =
              typeof marker.areaRadius === 'number' ? clamp(marker.areaRadius, 0, 1) : 0;
            if (radius > 0) {
              geometry = {
                kind: 'area',
                areaShape: 'circle',
                circle: {
                  center: {
                    x: clamp(marker.areaCenter.x, 0, 1),
                    y: clamp(marker.areaCenter.y, 0, 1),
                  },
                  radius,
                },
              };
            } else {
              geometry = { kind: 'point' };
            }
          } else if (marker.areaShape === 'lasso' && marker.areaPoints.length >= 3) {
            geometry = {
              kind: 'area',
              areaShape: 'polygon',
              polygon: marker.areaPoints.map((point) => ({
                x: clamp(point.x, 0, 1),
                y: clamp(point.y, 0, 1),
              })),
            };
          } else {
            geometry = { kind: 'point' };
          }
        }

        const regionId = marker.linkedRoomId ? regionIdByDraftId.get(marker.linkedRoomId) : undefined;

        const payload = await apiClient.createMarker(map.id, {
          label: marker.label.trim() || 'Marker',
          notes: marker.notes.trim() || undefined,
          color: marker.color.trim() || undefined,
          x: clamp(marker.x, 0, 1),
          y: clamp(marker.y, 0, 1),
          iconKey: marker.iconKey ?? undefined,
          regionId,
          ...geometry,
        });
        createdMarkers.push(payload);
      }

      onComplete(map, createdMarkers, createdRegions);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-slate-950/95 text-slate-100 backdrop-blur-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.18),transparent_45%),radial-gradient(circle_at_80%_0%,rgba(249,115,22,0.16),transparent_40%)] opacity-80"
      />
      <div className="relative flex min-h-dvh flex-col overflow-hidden">
        <header className="mb-0.5 border-b border-slate-800/70 px-5 py-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-amber-200">New Map Wizard</p>
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
                      ? 'border-amber-400/70 bg-amber-400/20 text-amber-100'
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
        <main className="flex-1 min-h-0 overflow-x-auto overflow-y-auto py-4">
          <div className="flex h-full min-h-0">
          <div
            ref={brushSliderHostRef}
            className="relative flex h-full w-0 flex-shrink-0 overflow-visible"
          />
          <div className="flex min-h-0 flex-1 flex-col overflow-x-visible overflow-y-hidden px-[10vw]">
          {step === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-4xl rounded-3xl border border-slate-800/70 bg-slate-900/70 p-4 text-center">
                <div
                  onDragEnter={(event) => event.preventDefault()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className="group relative flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700/70 bg-slate-950/70 px-6 py-4 transition hover:border-amber-400/60"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) {
                        handleFileSelected(selected);
                      }
                    }}
                  />
                  <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Drag &amp; Drop</p>
                  <h3 className="mt-3 text-2xl font-semibold text-white">Drop your map image here</h3>
                  <p className="mt-2 max-w-xl text-sm text-slate-400">
                    We accept PNG, JPG, WEBP, and other common image formats. Drop the file or browse your computer to get started.
                  </p>
                  <button
                    type="button"
                    onClick={handleBrowse}
                    className="mt-5 rounded-full border border-amber-400/60 bg-amber-300/80 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-amber-300/90"
                  >
                    Browse Files
                  </button>
                </div>
                {previewUrl && (
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-[0.4em] text-amber-200">Preview</p>
                    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-800/70">
                      <img
                        src={previewUrl}
                        alt="Uploaded map preview"
                        className="max-h-[280px] w-full object-contain"
                      />
                    </div>
                    {imageDimensions && (
                      <p className="mt-2 text-xs uppercase tracking-[0.4em] text-slate-500">
                        {imageDimensions.width} × {imageDimensions.height} pixels
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="flex flex-1 items-stretch justify-center">
              <div className="flex h-full w-full flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8">
                <div className="grid flex-1 min-h-0 gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="flex flex-col gap-5">
                    <div>
                      <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Map Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        placeholder="Ancient Ruins"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Description</label>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        placeholder="Give a brief overview of the map."
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Grouping</label>
                      <input
                        type="text"
                        value={grouping}
                        onChange={(event) => setGrouping(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        placeholder="Dungeon Delves"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Notes</label>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        placeholder="DM-only reminders or encounter tips"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-[0.4em] text-slate-400">Tags</label>
                      <input
                        type="text"
                        value={tagsInput}
                        onChange={(event) => setTagsInput(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                        placeholder="forest, ruins, night"
                      />
                      <p className="mt-2 text-xs text-slate-500">Separate tags with commas to help search and filtering.</p>
                    </div>
                  </div>
                  <div className="flex h-full flex-col gap-4">
                    <div className="flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/70">
                      {previewUrl ? (
                        <img
                          src={previewUrl}
                          alt="Map preview"
                          className="max-h-full w-full object-contain"
                        />
                      ) : (
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                          Upload a map image to preview it here.
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Tips</p>
                      <ul className="mt-2 space-y-2 text-xs text-slate-400">
                        <li>Keep names short but descriptive for quick reference during sessions.</li>
                        <li>Use notes to capture secrets, traps, or DM-only reminders.</li>
                        <li>Tags help you filter maps later in the campaign dashboard.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {(step === 2 || step === 3) && (
            <div className="flex h-full min-h-0 flex-1 justify-center">
              <div className="flex h-full min-h-0 w-full rounded-3xl border border-slate-800/70 bg-slate-900/70 p-4">
                <div
                  ref={defineRoomContainerRef}
                  className={`flex h-full min-h-0 w-full flex-col overflow-visible rounded-2xl border border-slate-800/70 bg-slate-950/80 ${
                    canLaunchRoomsEditor ? '' : 'items-center justify-center text-sm text-slate-500'
                  }`}
                >
                  {!canLaunchRoomsEditor && (
                    <p>{previewUrl ? 'Loading room editor…' : 'Upload a map image to start defining rooms.'}</p>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </main>
        <footer className="mt-0.5 border-t border-slate-800/70 px-5 py-1.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-full border border-slate-700/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-amber-400/60 hover:text-amber-200"
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <div className="flex flex-wrap items-center gap-3">
            {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
            {step < steps.length - 1 ? (
              <button
                type="button"
                disabled={!allowNext}
                onClick={handleContinue}
                className={`rounded-full border px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${
                  allowNext
                    ? 'border-amber-400/60 bg-amber-300/80 text-slate-900 hover:bg-amber-300/90'
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
                className={`rounded-full border px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${
                  creating
                    ? 'cursor-wait border-slate-800/70 bg-slate-900/70 text-slate-500'
                    : 'border-amber-400/60 bg-amber-300/80 text-slate-900 hover:bg-amber-300/90'
                }`}
              >
                {creating ? 'Creating…' : 'Create Map'}
              </button>
            )}
          </div>
        </div>
        </footer>
      </div>
    </div>
  );
};

export default MapCreationWizard;
