import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiClient } from '../api/client';
import {
  computeDisplayMetrics,
  type ImageDisplayMetrics,
} from '../utils/imageProcessing';
import type { Campaign, MapRecord, Marker, Region } from '../types';
import { DefineRoom, type DefinedRoomSummary } from '../define-rooms/DefineRoom';
import type { RoomMask } from '../utils/roomMask';
import './DefineRoomsOverlay.css';

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
    description: 'Launch the room editor to paint regions that you want to reveal during play.',
  },
  {
    title: 'Add Markers',
    description: 'Drag markers onto the map to highlight points of interest for your players.',
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

const buildRoomMaskFromBinary = (
  mask: Uint8Array,
  dimensions: { width: number; height: number },
): RoomMask => {
  const { width, height } = dimensions;
  const data = new Uint8ClampedArray(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) {
        data[index] = 255;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      } else {
        data[index] = 0;
      }
    }
  }

  if (maxX === -1 || maxY === -1) {
    minX = 0;
    minY = 0;
    maxX = Math.max(0, width - 1);
    maxY = Math.max(0, height - 1);
  }

  const bounds = {
    minX: width === 0 ? 0 : minX / width,
    minY: height === 0 ? 0 : minY / height,
    maxX: width === 0 ? 1 : (maxX + 1) / width,
    maxY: height === 0 ? 1 : (maxY + 1) / height,
  };

  return { width, height, bounds, data };
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
  const [definedRooms, setDefinedRooms] = useState<DefinedRoomSummary[]>([]);
  const [defineRoomsError, setDefineRoomsError] = useState<string | null>(null);
  const [defineRoomsLoading, setDefineRoomsLoading] = useState(false);
  const [defineRoomDimensions, setDefineRoomDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defineRoomRef = useRef<DefineRoom | null>(null);
  const defineRoomContainerRef = useRef<HTMLDivElement | null>(null);
  const defineRoomImageRef = useRef<{ url: string; image: HTMLImageElement } | null>(null);
  const skipNextDefineRoomsSyncRef = useRef(false);

  const syncDefinedRooms = useCallback(() => {
    if (skipNextDefineRoomsSyncRef.current) {
      skipNextDefineRoomsSyncRef.current = false;
      setDefinedRooms([]);
      setDefineRoomDimensions(null);
      return;
    }

    const instance = defineRoomRef.current;
    if (!instance) {
      return;
    }

    const rooms = instance
      .getRooms()
      .filter((room) => room.isConfirmed);
    setDefinedRooms(rooms);
    const dimensions = instance.getDimensions();
    if (dimensions) {
      setDefineRoomDimensions(dimensions);
    }
  }, [setDefinedRooms, setDefineRoomDimensions]);

  const loadImageForDefineRooms = useCallback(() => {
    if (!previewUrl) {
      return Promise.reject(new Error('Upload a map image before defining rooms.'));
    }
    if (defineRoomImageRef.current?.url === previewUrl) {
      return Promise.resolve(defineRoomImageRef.current.image);
    }
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        defineRoomImageRef.current = { url: previewUrl, image };
        resolve(image);
      };
      image.onerror = () => {
        reject(new Error('Unable to load the uploaded map image.'));
      };
      image.src = previewUrl;
    });
  }, [previewUrl]);

  const handleOpenDefineRooms = useCallback(async () => {
    const instance = defineRoomRef.current;
    if (!instance) {
      return;
    }
    setDefineRoomsError(null);
    setDefineRoomsLoading(true);
    try {
      const image = await loadImageForDefineRooms();
      instance.open(image);
      const dimensions = instance.getDimensions();
      if (dimensions) {
        setDefineRoomDimensions(dimensions);
      } else {
        setDefineRoomDimensions({
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        });
      }
    } catch (err) {
      setDefineRoomsError((err as Error).message);
    } finally {
      setDefineRoomsLoading(false);
    }
  }, [loadImageForDefineRooms]);

  const handleRefreshDefinedRooms = useCallback(() => {
    setDefineRoomsError(null);
    syncDefinedRooms();
  }, [syncDefinedRooms]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    defineRoomContainerRef.current = container;
    const instance = new DefineRoom();
    instance.mount(container);
    defineRoomRef.current = instance;
    const unsubscribe = instance.onClose(() => {
      syncDefinedRooms();
    });

    return () => {
      unsubscribe();
      skipNextDefineRoomsSyncRef.current = true;
      instance.close();
      defineRoomRef.current = null;
      defineRoomImageRef.current = null;
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      defineRoomContainerRef.current = null;
    };
  }, [syncDefinedRooms]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setImageDimensions(null);
      setDefinedRooms([]);
      setDefineRoomDimensions(null);
      defineRoomImageRef.current = null;
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

  const markerDisplayMetrics = useImageDisplayMetrics(mapAreaRef, imageDimensions);

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

  const handleFileSelected = useCallback(
    (selected: File) => {
      setFile(selected);
      setMarkers([]);
      setExpandedMarkerId(null);
      setDefinedRooms([]);
      setDefineRoomsError(null);
      setDefineRoomDimensions(null);
      defineRoomImageRef.current = null;
      if (defineRoomRef.current) {
        skipNextDefineRoomsSyncRef.current = true;
        defineRoomRef.current.close();
      }
    },
    [defineRoomRef, skipNextDefineRoomsSyncRef],
  );

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
      syncDefinedRooms();
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
    syncDefinedRooms();
    const instance = defineRoomRef.current;
    const roomsFromInstance =
      instance?.getRooms().filter((room) => room.isConfirmed) ?? definedRooms;
    const roomDimensions = instance?.getDimensions() ?? defineRoomDimensions;
    if (roomsFromInstance.length > 0 && !roomDimensions) {
      setError('Room boundaries could not be saved. Reopen the Define Rooms editor and try again.');
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
      if (roomsFromInstance.length > 0 && roomDimensions) {
        for (const [index, room] of roomsFromInstance.entries()) {
          const mask = buildRoomMaskFromBinary(room.mask, roomDimensions);
          const noteSections: string[] = [];
          const trimmedDescription = room.description.trim();
          const trimmedTags = room.tags.trim();
          if (trimmedDescription) {
            noteSections.push(trimmedDescription);
          }
          if (trimmedTags) {
            noteSections.push(`Tags: ${trimmedTags}`);
          }
          if (room.visibleAtStart) {
            noteSections.push('Visible at start of game');
          }
          const notesValue = noteSections.length > 0 ? noteSections.join('\n\n') : undefined;
          const region = await apiClient.createRegion(map.id, {
            name: room.name.trim() || `Room ${index + 1}`,
            notes: notesValue,
            revealOrder: room.visibleAtStart ? index : undefined,
            mask,
          });
          createdRegions.push(region);
        }
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
      <main className="flex-1 overflow-hidden px-6 py-6">
        <div className="flex h-full flex-col overflow-hidden">
          {step === 0 && (
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-4xl rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8 text-center">
                <div
                  onDragEnter={(event) => event.preventDefault()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                  className="group relative flex min-h-[200px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700/70 bg-slate-950/70 px-6 py-8 transition hover:border-teal-400/60"
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
                    className="mt-5 rounded-full border border-teal-400/60 bg-teal-500/80 px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-900 transition hover:bg-teal-400/90"
                  >
                    Browse Files
                  </button>
                </div>
                {previewUrl && (
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-[0.4em] text-teal-300">Preview</p>
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
              <div className="flex h-full w-full max-w-5xl flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8">
                <div className="grid flex-1 min-h-0 gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="flex flex-col gap-5">
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
            <div className="flex flex-1 items-center justify-center">
              <div className="flex h-full w-full max-w-5xl flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8">
                <div className="max-w-3xl">
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Room Boundaries</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Define rooms on your map</h3>
                  <p className="mt-3 text-sm text-slate-400">
                    Launch the room editor to paint the spaces that your players can reveal. Close the editor to
                    sync your progress back into this wizard.
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={handleOpenDefineRooms}
                    disabled={defineRoomsLoading || !previewUrl}
                    className={`rounded-full border px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                      defineRoomsLoading || !previewUrl
                        ? 'cursor-not-allowed border-slate-800/70 bg-slate-900/70 text-slate-500'
                        : 'border-teal-400/60 bg-teal-500/80 text-slate-900 hover:bg-teal-400/90'
                    }`}
                  >
                    {defineRoomsLoading ? 'Preparing editor…' : 'Launch Room Editor'}
                  </button>
                  <button
                    type="button"
                    onClick={handleRefreshDefinedRooms}
                    className="rounded-full border border-slate-700/70 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-300 transition hover:border-teal-400/60 hover:text-teal-200"
                  >
                    Refresh Saved Rooms
                  </button>
                  <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
                    Rooms are linked to the image uploaded in step one.
                  </p>
                </div>
                {defineRoomsError && (
                  <p className="mt-4 text-sm text-rose-300">{defineRoomsError}</p>
                )}
                <div className="mt-8 flex-1 overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Saved Rooms</p>
                      <h4 className="text-lg font-semibold text-white">
                        {definedRooms.length > 0 ? `${definedRooms.length} room${definedRooms.length === 1 ? '' : 's'} saved` : 'No rooms saved yet'}
                      </h4>
                    </div>
                    {defineRoomDimensions && (
                      <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
                        {defineRoomDimensions.width} × {defineRoomDimensions.height} pixels
                      </p>
                    )}
                  </div>
                  {definedRooms.length > 0 ? (
                    <ul className="mt-4 space-y-3 overflow-y-auto pr-1">
                      {definedRooms.map((room, index) => {
                        const visibleLabel = room.visibleAtStart ? 'Visible at start' : 'Hidden until reveal';
                        return (
                          <li
                            key={room.id}
                            className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4 shadow-inner"
                          >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-3 w-3 rounded-full border border-slate-700/70"
                                    style={{ backgroundColor: room.color || '#38bdf8' }}
                                  />
                                  <p className="text-sm font-semibold text-white">
                                    {room.name.trim() || `Room ${index + 1}`}
                                  </p>
                                </div>
                                {room.description.trim() && (
                                  <p className="mt-2 whitespace-pre-line text-xs text-slate-400">
                                    {room.description.trim()}
                                  </p>
                                )}
                                {room.tags.trim() && (
                                  <p className="mt-1 text-[10px] uppercase tracking-[0.35em] text-slate-500">
                                    Tags: {room.tags}
                                  </p>
                                )}
                              </div>
                              <span
                                className={`text-[10px] uppercase tracking-[0.35em] ${
                                  room.visibleAtStart ? 'text-teal-200' : 'text-slate-500'
                                }`}
                              >
                                {visibleLabel}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-dashed border-slate-700/70 px-6 py-8 text-sm text-slate-400">
                      Launch the editor to paint room shapes and capture their details. Close the editor when you are done to
                      keep them in sync.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="grid h-full min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              <div
                ref={mapAreaRef}
                className="relative flex h-full min-h-0 max-h-full items-center justify-center overflow-hidden rounded-3xl border border-slate-800/70 bg-slate-900/70"
              >
                {previewUrl ? (
                  <>
                    <img
                      src={previewUrl}
                      alt="Interactive map preview"
                      className="w-full max-h-full object-contain"
                    />
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
              <div className="flex h-full min-h-0 flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70">
                <div className="border-b border-slate-800/70 p-4">
                  <div className="flex items-center justify-between gap-3">
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
                <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4">
                  {markers.map((marker) => {
                    const isExpanded = expandedMarkerId === marker.id;
                    return (
                      <div
                        key={marker.id}
                        className={`rounded-2xl border px-4 py-3 transition ${
                          isExpanded
                            ? 'border-teal-400/60 bg-slate-950/80'
                            : 'border-slate-800/70 bg-slate-950/70'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMarkerId(isExpanded ? null : marker.id)
                          }
                          className="flex w-full items-start justify-between gap-3 text-left"
                          aria-expanded={isExpanded}
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">{marker.label || 'Marker'}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-slate-500">
                              <span>
                                Position: {Math.round(marker.x * 100)}% × {Math.round(marker.y * 100)}%
                              </span>
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full border border-slate-700/70"
                                  style={{ backgroundColor: marker.color || '#facc15' }}
                                />
                                <span>{marker.color}</span>
                              </span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] uppercase tracking-[0.35em] ${
                              isExpanded ? 'text-teal-200' : 'text-slate-400'
                            }`}
                          >
                            {isExpanded ? 'Hide' : 'Edit'}
                          </span>
                        </button>
                        {isExpanded && (
                          <div className="mt-3 space-y-3">
                            <label className="block text-[10px] uppercase tracking-[0.4em] text-slate-500">
                              Label
                              <input
                                type="text"
                                value={marker.label}
                                onChange={(event) =>
                                  handleMarkerChange(marker.id, 'label', event.target.value)
                                }
                                className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                                placeholder="Secret Door"
                              />
                            </label>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                              <label className="block text-[10px] uppercase tracking-[0.4em] text-slate-500">
                                Notes
                                <textarea
                                  value={marker.notes}
                                  onChange={(event) =>
                                    handleMarkerChange(marker.id, 'notes', event.target.value)
                                  }
                                  rows={2}
                                  className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                                  placeholder="Trap trigger, treasure cache, etc."
                                />
                              </label>
                              <label className="block text-[10px] uppercase tracking-[0.4em] text-slate-500">
                                Color
                                <input
                                  type="text"
                                  value={marker.color}
                                  onChange={(event) =>
                                    handleMarkerChange(marker.id, 'color', event.target.value)
                                  }
                                  className="mt-2 w-full rounded-xl border border-slate-800/60 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                                  placeholder="#facc15"
                                />
                              </label>
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleRemoveMarker(marker.id)}
                                className="rounded-full border border-rose-400/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-400/20"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {markers.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 px-4 py-8 text-center text-xs text-slate-500">
                      No markers yet. Add a marker to start placing points of interest.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
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
