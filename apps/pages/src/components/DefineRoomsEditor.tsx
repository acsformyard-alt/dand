import React from 'react';

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

const DefineRoomsEditor: React.FC<DefineRoomsEditorProps> = ({
  imageUrl,
  imageDimensions,
  rooms,
  onRoomsChange,
}) => {
  const handleClearRooms = () => {
    onRoomsChange([]);
  };

  if (!imageUrl) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Upload a map image to start outlining rooms.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/70 p-6 text-center text-sm text-slate-300">
        <p className="text-xs uppercase tracking-[0.35em] text-teal-200">Define Rooms Editor</p>
        <p className="mt-3 max-w-xl text-slate-300">
          The legacy room authoring tools have been removed. A brand-new editor will appear here in an upcoming update.
          In the meantime you can continue creating your map without outlining rooms, or clear any placeholder rooms below.
        </p>
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800/60 bg-slate-900/60">
          <img src={imageUrl} alt="Map preview" className="max-h-[360px] w-full object-contain" />
          {imageDimensions && (
            <p className="bg-slate-900/80 py-2 text-[10px] uppercase tracking-[0.4em] text-slate-400">
              {imageDimensions.width} × {imageDimensions.height} pixels
            </p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-800/70 bg-slate-950/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Current Rooms</p>
            <p className="text-sm text-slate-300">
              {rooms.length === 0
                ? 'No rooms defined. You can still finish the wizard and add rooms later.'
                : `${rooms.length} room${rooms.length === 1 ? '' : 's'} retained from earlier drafts.`}
            </p>
          </div>
          {rooms.length > 0 && (
            <button
              type="button"
              onClick={handleClearRooms}
              className="rounded-full border border-rose-400/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-200 transition hover:bg-rose-400/20"
            >
              Clear Rooms
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DefineRoomsEditor;
