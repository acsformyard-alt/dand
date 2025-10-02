import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DefineRoom, type DefineRoomData } from '../define-rooms/DefineRoom';
import '../define-rooms/styles.css';
import { apiClient } from '../api/client';
import {
  computeDisplayMetrics,
  type ImageDisplayMetrics,
} from '../utils/imageProcessing';
import { roomMaskToPolygon, type RoomMask } from '../utils/roomMask';
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
    description: 'Drag markers onto the map to highlight points of interest for your players.',
  },
];

const AddMarkerIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defineRoomRef = useRef<DefineRoom | null>(null);
  const defineRoomImageRef = useRef<HTMLImageElement | null>(null);
  const brushSliderHostRef = useRef<HTMLDivElement | null>(null);
  const [defineRoomReady, setDefineRoomReady] = useState(false);
  const defineRoomContainerRef = useCallback((node: HTMLDivElement | null) => {
    setDefineRoomContainer(node);
  }, []);

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

  useEffect(() => {
    const editor = new DefineRoom({ mode: 'embedded' });
    defineRoomRef.current = editor;
    setDefineRoomReady(true);

    const originalClose = editor.close.bind(editor);
    (editor as unknown as { close: () => void }).close = () => {
      syncRoomsFromEditor();
      originalClose();
    };

    return () => {
      (editor as unknown as { close: () => void }).close = originalClose;
      editor.destroy();
      defineRoomRef.current = null;
      defineRoomImageRef.current = null;
      setDefineRoomReady(false);
    };
  }, [syncRoomsFromEditor]);

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
      if (step === 2) {
        defineRoomRef.current?.open(image, { resetExisting: true });
      } else {
        defineRoomRef.current?.close();
      }
    };
    image.src = previewUrl;

    return () => {
      cancelled = true;
    };
  }, [defineRoomReady, previewUrl, step]);

  useEffect(() => {
    if (!defineRoomReady) {
      return;
    }
    const editor = defineRoomRef.current;
    if (!editor) {
      return;
    }
    if (step === 2 && defineRoomImageRef.current) {
      editor.open(defineRoomImageRef.current, { resetExisting: false });
    } else {
      editor.close();
    }
  }, [defineRoomReady, step]);

  const markerDisplayMetrics = useImageDisplayMetrics(mapAreaRef, imageDimensions);

  const roomsWithMask = useMemo(
    () => definedRooms.filter((room) => room.mask),
    [definedRooms],
  );

  const markerRoomOverlays = useMemo(
    () => {
      if (!imageDimensions) {
        return [] as Array<{
          id: string;
          name: string;
          color: string;
          path: string;
          labelPosition: { x: number; y: number } | null;
        }>;
      }

      return roomsWithMask
        .map((room) => {
          if (!room.mask) {
            return null;
          }
          const polygon = roomMaskToPolygon(room.mask);
          if (polygon.length < 3) {
            return null;
          }

          const scaled = polygon.map((point) => ({
            x: point.x * imageDimensions.width,
            y: point.y * imageDimensions.height,
          }));

          const pathCommands = scaled
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
            .join(' ');

          const path = `${pathCommands} Z`;

          let area = 0;
          let centroidX = 0;
          let centroidY = 0;

          for (let index = 0; index < scaled.length; index += 1) {
            const current = scaled[index];
            const next = scaled[(index + 1) % scaled.length];
            const cross = current.x * next.y - next.x * current.y;
            area += cross;
            centroidX += (current.x + next.x) * cross;
            centroidY += (current.y + next.y) * cross;
          }

          area *= 0.5;
          let labelPosition: { x: number; y: number } | null = null;

          if (Math.abs(area) > 1e-5) {
            labelPosition = {
              x: centroidX / (6 * area),
              y: centroidY / (6 * area),
            };
          } else {
            const fallback = scaled.reduce(
              (accumulator, point) => ({
                x: accumulator.x + point.x,
                y: accumulator.y + point.y,
              }),
              { x: 0, y: 0 },
            );
            labelPosition = {
              x: fallback.x / scaled.length,
              y: fallback.y / scaled.length,
            };
          }

          return {
            id: room.id,
            name: room.name || 'Untitled Room',
            color: room.color,
            path,
            labelPosition,
          };
        })
        .filter((value): value is {
          id: string;
          name: string;
          color: string;
          path: string;
          labelPosition: { x: number; y: number } | null;
        } => value !== null);
    },
    [imageDimensions, roomsWithMask],
  );

  const markerOverlayStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!markerDisplayMetrics || !imageDimensions) {
      return undefined;
    }

    return {
      left: markerDisplayMetrics.offsetX,
      top: markerDisplayMetrics.offsetY,
      width: markerDisplayMetrics.displayWidth,
      height: markerDisplayMetrics.displayHeight,
    };
  }, [imageDimensions, markerDisplayMetrics]);

  useEffect(() => {
    if (!draggingId) return;

    const handlePointerMove = (event: PointerEvent) => {
      const point = resolveNormalizedPointWithinImage(
        event,
        mapAreaRef.current,
        imageDimensions,
        markerDisplayMetrics,
      );
      if (!point) return;
      setMarkers((current) =>
        current.map((marker) =>
          marker.id === draggingId ? { ...marker, x: point.x, y: point.y } : marker,
        ),
      );
    };

    const handlePointerUp = () => {
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
  }, [draggingId, imageDimensions, markerDisplayMetrics]);

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

  const handleMarkerChange = (markerId: string, field: keyof DraftMarker, value: string) => {
    setMarkers((current) =>
      current.map((marker) =>
        marker.id === markerId
          ? {
              ...marker,
              [field]: field === 'x' || field === 'y' ? Number(value) : value,
            }
          : marker,
      ),
    );
  };

  const handleRemoveMarker = (markerId: string) => {
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setExpandedMarkerId((current) => (current === markerId ? null : current));
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
    setExpandedMarkerId(newMarker.id);
  };

  const handleContinue = () => {
    if (step === 2) {
      syncRoomsFromEditor();
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
        const region = await apiClient.createRegion(map.id, {
          name: room.name.trim() || `Room ${index + 1}`,
          mask: room.mask,
          notes: notesValue,
          revealOrder: room.visibleAtStart ? index : undefined,
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
          {step === 2 && (
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
          {step === 3 && (
            <div className="flex h-full min-h-0 flex-1 justify-center">
              <div className="flex h-full min-h-0 w-full rounded-3xl border border-slate-800/70 bg-slate-900/70 p-4">
                <div className="define-room-body marker-step">
                  <section className="define-room-editor">
                    <div className="toolbar-area">
                      <div className="marker-toolbar-wrapper">
                        <div className="marker-room-legend">
                          <p className="marker-legend-title">Rooms</p>
                          {roomsWithMask.length > 0 ? (
                            <ul className="marker-room-legend-list">
                              {roomsWithMask.map((room) => (
                                <li key={room.id} className="marker-room-legend-item">
                                  <span
                                    className="marker-room-legend-swatch"
                                    style={{ backgroundColor: room.color }}
                                  />
                                  <div className="marker-room-legend-details">
                                    <span className="marker-room-legend-name">
                                      {room.name || 'Untitled Room'}
                                    </span>
                                    <span className="marker-room-legend-meta">
                                      Mask visible on map
                                    </span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="marker-legend-empty">
                              Rooms that you define in the previous step will appear here and be
                              highlighted on the map to guide marker placement.
                            </p>
                          )}
                        </div>
                        <div className="toolbar marker-toolbar">
                          <div className="toolbar-primary-group">
                            <button
                              type="button"
                              onClick={handleAddMarker}
                              className="toolbar-button toolbar-primary"
                              disabled={!previewUrl}
                            >
                              <span className="toolbar-button-icon" aria-hidden="true">
                                <AddMarkerIcon />
                              </span>
                              <span className="toolbar-button-label" aria-hidden="true">
                                Add Marker
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="canvas-wrapper marker-canvas-wrapper">
                      <div ref={mapAreaRef} className="marker-stage">
                        {previewUrl ? (
                          <>
                            <img
                              src={previewUrl}
                              alt="Interactive map preview"
                              className="marker-stage-image"
                            />
                            {imageDimensions && markerRoomOverlays.length > 0 && markerOverlayStyle && (
                              <svg
                                className="marker-mask-overlay"
                                viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
                                preserveAspectRatio="none"
                                style={markerOverlayStyle}
                              >
                                {markerRoomOverlays.map((room) => (
                                  <g key={room.id} className="marker-mask-room">
                                    <path d={room.path} fill={room.color} stroke={room.color} />
                                    {room.labelPosition && (
                                      <text
                                        x={room.labelPosition.x}
                                        y={room.labelPosition.y}
                                        className="marker-mask-label"
                                      >
                                        {room.name}
                                      </text>
                                    )}
                                  </g>
                                ))}
                              </svg>
                            )}
                            {markers.map((marker) => (
                              <button
                                key={marker.id}
                                type="button"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  setDraggingId(marker.id);
                                }}
                                style={containerPointToStyle(
                                  normalisedToContainerPoint(
                                    { x: marker.x, y: marker.y },
                                    markerDisplayMetrics,
                                  ),
                                )}
                                className="marker-pin"
                              >
                                <span
                                  className="marker-pin-color"
                                  style={{ backgroundColor: marker.color || '#facc15' }}
                                />
                                <span className="marker-pin-label">
                                  {marker.label || 'Marker'}
                                </span>
                              </button>
                            ))}
                            {markers.length === 0 && (
                              <div className="marker-stage-placeholder">
                                Add markers from the panel to start placing points of interest.
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="marker-stage-placeholder">
                            Upload a map image to place markers.
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                  <aside className="define-room-sidebar marker-sidebar">
                    <div className="rooms-header">
                      <h2>Markers</h2>
                      <button
                        type="button"
                        onClick={handleAddMarker}
                        className="new-room"
                        disabled={!previewUrl}
                      >
                        Add Marker
                      </button>
                    </div>
                    <p className="rooms-empty marker-empty">
                      Create markers and drag them directly onto the map. Use notes to capture quick
                      reminders.
                    </p>
                    <div className="rooms-list marker-list">
                      {markers.map((marker) => {
                        const isExpanded = expandedMarkerId === marker.id;
                        return (
                          <div
                            key={marker.id}
                            className={`room-card marker-card ${isExpanded ? 'expanded' : ''}`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMarkerId(isExpanded ? null : marker.id)
                              }
                              className="room-row marker-row"
                              aria-expanded={isExpanded}
                            >
                              <span
                                className="room-color"
                                style={{ backgroundColor: marker.color || '#facc15' }}
                              />
                              <div className="marker-row-details">
                                <span className="marker-row-name">{marker.label || 'Marker'}</span>
                                <span className="marker-row-meta">
                                  Position: {Math.round(marker.x * 100)}% ×{' '}
                                  {Math.round(marker.y * 100)}%
                                </span>
                              </div>
                              <span className="marker-row-toggle">
                                {isExpanded ? 'Hide' : 'Edit'}
                              </span>
                            </button>
                            {isExpanded && (
                              <div className="room-card-body marker-card-body">
                                <div className="room-field">
                                  <label className="room-field-label" htmlFor={`${marker.id}-label`}>
                                    Label
                                  </label>
                                  <input
                                    id={`${marker.id}-label`}
                                    type="text"
                                    value={marker.label}
                                    onChange={(event) =>
                                      handleMarkerChange(marker.id, 'label', event.target.value)
                                    }
                                    className="marker-field-input"
                                    placeholder="Secret Door"
                                  />
                                </div>
                                <div className="room-field">
                                  <label
                                    className="room-field-label"
                                    htmlFor={`${marker.id}-notes`}
                                  >
                                    Notes
                                  </label>
                                  <textarea
                                    id={`${marker.id}-notes`}
                                    value={marker.notes}
                                    onChange={(event) =>
                                      handleMarkerChange(marker.id, 'notes', event.target.value)
                                    }
                                    rows={3}
                                    className="marker-field-textarea"
                                    placeholder="Trap trigger, treasure cache, etc."
                                  />
                                </div>
                                <div className="room-field">
                                  <label
                                    className="room-field-label"
                                    htmlFor={`${marker.id}-color`}
                                  >
                                    Color
                                  </label>
                                  <input
                                    id={`${marker.id}-color`}
                                    type="text"
                                    value={marker.color}
                                    onChange={(event) =>
                                      handleMarkerChange(marker.id, 'color', event.target.value)
                                    }
                                    className="marker-field-input"
                                    placeholder="#facc15"
                                  />
                                </div>
                                <div className="room-card-footer marker-card-footer">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMarker(marker.id)}
                                    className="marker-remove-button"
                                  >
                                    Remove Marker
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {markers.length === 0 && (
                        <div className="marker-list-empty">
                          No markers yet. Add a marker to start placing points of interest.
                        </div>
                      )}
                    </div>
                  </aside>
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
