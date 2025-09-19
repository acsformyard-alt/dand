import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api/client';
import type { Campaign, MapRecord, Marker } from '../types';

type WizardStep = 0 | 1 | 2;

interface MapCreationWizardProps {
  campaign: Campaign;
  onClose: () => void;
  onComplete: (map: MapRecord, markers: Marker[]) => void;
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
    title: 'Add Markers',
    description: 'Drag markers onto the map to highlight points of interest for your players.',
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

  useEffect(() => {
    if (!file) {
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
      setImageDimensions(null);
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
      const container = mapAreaRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const relativeX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const relativeY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      setMarkers((current) =>
        current.map((marker) => (marker.id === draggingId ? { ...marker, x: relativeX, y: relativeY } : marker))
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
  }, [draggingId]);

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

      onComplete(map, createdMarkers);
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
                        style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
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
                      <h3 className="text-lg font-semibold text-white">Drag & Drop Points</h3>
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
