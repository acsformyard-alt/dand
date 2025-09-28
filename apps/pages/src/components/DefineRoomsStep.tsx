import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DefineRoom, type DefineRoomSerializedRoom } from '../define-rooms/DefineRoom';
import '../define-rooms/define-room.css';

interface DefineRoomsStepProps {
  previewUrl: string | null;
  imageDimensions: { width: number; height: number } | null;
  rooms: DefineRoomSerializedRoom[];
  onRoomsChange: (rooms: DefineRoomSerializedRoom[]) => void;
}

const hasMaskPixels = (mask: Uint8Array) => mask.some((value) => value > 0);

const DefineRoomsStep: React.FC<DefineRoomsStepProps> = ({
  previewUrl,
  imageDimensions,
  rooms,
  onRoomsChange,
}) => {
  const instanceRef = useRef<DefineRoom | null>(null);
  const mountedRef = useRef(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ensureInstance = useCallback(() => {
    if (!instanceRef.current) {
      instanceRef.current = new DefineRoom({
        onRoomsChange,
        onClose: () => {
          if (mountedRef.current) {
            setLaunching(false);
          }
        },
      });
      instanceRef.current.mount(document.body);
    }
    return instanceRef.current;
  }, [onRoomsChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (instanceRef.current) {
        instanceRef.current.close();
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!previewUrl) {
      instanceRef.current?.close();
    }
  }, [previewUrl]);

  const handleLaunch = useCallback(() => {
    if (!previewUrl) {
      setError('Upload a map image in the first step before defining rooms.');
      return;
    }
    setError(null);
    setLaunching(true);
    const image = new Image();
    image.onload = () => {
      const instance = ensureInstance();
      instance.open(image, rooms);
      if (mountedRef.current) {
        setLaunching(false);
      }
    };
    image.onerror = () => {
      if (mountedRef.current) {
        setLaunching(false);
        setError('The uploaded map image could not be loaded. Try selecting the file again.');
      }
    };
    image.src = previewUrl;
  }, [ensureInstance, previewUrl, rooms]);

  const roomSummaries = useMemo(
    () =>
      rooms.map((room) => {
        const hasMask = hasMaskPixels(room.mask);
        const status = room.isConfirmed
          ? hasMask
            ? 'Ready'
            : 'Needs boundary'
          : 'Draft';
        return {
          ...room,
          hasMask,
          status,
        };
      }),
    [rooms],
  );

  return (
    <div className="flex flex-1 items-stretch justify-center">
      <div className="flex h-full w-full max-w-5xl flex-col rounded-3xl border border-slate-800/70 bg-slate-900/70 p-8">
        <div className="grid flex-1 grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/70">
              {previewUrl ? (
                <img src={previewUrl} alt="Map preview" className="w-full object-contain" />
              ) : (
                <div className="flex h-64 items-center justify-center text-sm uppercase tracking-[0.35em] text-slate-500">
                  Upload a map image to begin defining rooms.
                </div>
              )}
            </div>
            {imageDimensions ? (
              <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">
                {imageDimensions.width} × {imageDimensions.height} pixels
              </p>
            ) : null}
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleLaunch}
                disabled={!previewUrl || launching}
                className={`inline-flex w-full items-center justify-center rounded-full border px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                  previewUrl && !launching
                    ? 'border-teal-400/60 bg-teal-500/80 text-slate-900 hover:bg-teal-400/90'
                    : 'cursor-not-allowed border-slate-800/70 bg-slate-900/70 text-slate-500'
                }`}
              >
                {launching ? 'Loading…' : 'Open Define Rooms Editor'}
              </button>
              <p className="text-xs text-slate-400">
                Launch the editor to paint room boundaries, update their details, and control which rooms are visible at the
                start of an encounter.
              </p>
              {error && <p className="text-xs font-semibold text-rose-300">{error}</p>}
            </div>
          </div>
          <div className="flex min-h-0 flex-col rounded-2xl border border-slate-800/70 bg-slate-950/70 p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold text-white">Defined Rooms</h3>
              <span className="text-[10px] uppercase tracking-[0.35em] text-slate-500">
                {roomSummaries.length} {roomSummaries.length === 1 ? 'room' : 'rooms'}
              </span>
            </div>
            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              {roomSummaries.length > 0 ? (
                <ul className="space-y-3">
                  {roomSummaries.map((room) => (
                    <li
                      key={room.id}
                      className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-3 w-3 rounded-full border border-slate-700/70"
                            style={{ backgroundColor: room.color || '#0ea5e9' }}
                          />
                          <span className="text-sm font-semibold text-white">{room.name || 'Untitled Room'}</span>
                        </div>
                        <span
                          className={`text-[10px] uppercase tracking-[0.35em] ${
                            room.status === 'Ready'
                              ? 'text-teal-300'
                              : room.status === 'Draft'
                              ? 'text-amber-300'
                              : 'text-rose-300'
                          }`}
                        >
                          {room.status}
                        </span>
                      </div>
                      {(room.description || room.tags) && (
                        <p className="mt-2 text-xs text-slate-400">
                          {room.description}
                          {room.description && room.tags ? ' · ' : ''}
                          {room.tags ? `Tags: ${room.tags}` : ''}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.35em] text-slate-500">
                        <span>{room.hasMask ? 'Boundary painted' : 'No boundary yet'}</span>
                        {room.visibleAtStart ? (
                          <span className="rounded-full border border-teal-400/40 px-2 py-1 text-[10px] uppercase tracking-[0.35em] text-teal-200">
                            Visible at start
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-700/70 p-6 text-center text-xs uppercase tracking-[0.35em] text-slate-500">
                  No rooms defined yet. Use the editor to add your first room.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefineRoomsStep;
