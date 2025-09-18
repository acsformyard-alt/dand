import React from "react";
import clsx from "clsx";

interface SessionSidebarProps {
  players: { id: string; name: string; role: string }[];
  lastEvent: string | null;
  connection: "idle" | "connecting" | "open" | "closed";
  onReconnect: () => void;
}

const roleBadges: Record<string, string> = {
  dm: "bg-purple-500/20 text-purple-200 border border-purple-500/50",
  player: "bg-slate-600/30 text-slate-200 border border-slate-500/60"
};

const SessionSidebar: React.FC<SessionSidebarProps> = ({ players, lastEvent, connection, onReconnect }) => {
  return (
    <aside className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-slate-200/40 bg-slate-900/70 p-4 text-slate-100">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Session Presence</h2>
          <p className="text-xs text-slate-400">Realtime updates from the virtual tabletop</p>
        </div>
        <span className={clsx("rounded-full px-2 py-1 text-xs font-semibold", connectionClass(connection))}>{connectionLabel(connection)}</span>
      </header>
      <div className="space-y-2">
        {players.length === 0 ? (
          <p className="text-sm text-slate-400">No connected players yet.</p>
        ) : (
          players.map((player) => (
            <div key={player.id} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <span className="font-medium">{player.name}</span>
              <span className={clsx("rounded-full px-2 py-1 text-xs capitalize", roleBadges[player.role] ?? roleBadges.player)}>
                {player.role}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="rounded-lg bg-slate-800/60 p-3 text-xs text-slate-300">
        <div className="font-semibold uppercase tracking-wide text-slate-400">Last event</div>
        <div className="mt-1 text-sm text-slate-200">{lastEvent ?? "—"}</div>
      </div>
      <button
        type="button"
        className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-600 focus:outline-none focus:ring"
        onClick={onReconnect}
      >
        Reconnect Socket
      </button>
    </aside>
  );
};

function connectionLabel(state: SessionSidebarProps["connection"]) {
  switch (state) {
    case "idle":
      return "Idle";
    case "connecting":
      return "Connecting";
    case "open":
      return "Live";
    case "closed":
      return "Closed";
    default:
      return state;
  }
}

function connectionClass(state: SessionSidebarProps["connection"]) {
  switch (state) {
    case "open":
      return "bg-emerald-500/20 text-emerald-200 border border-emerald-500/60";
    case "connecting":
      return "bg-amber-500/20 text-amber-200 border border-amber-500/60";
    case "closed":
      return "bg-rose-500/20 text-rose-200 border border-rose-500/60";
    default:
      return "bg-slate-600/20 text-slate-200 border border-slate-500/60";
  }
}

export default SessionSidebar;
