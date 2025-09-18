import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";

export interface SessionStateMessage {
  sessionId: string | null;
  campaignId: string | null;
  mapId: string | null;
  map: any;
  regions: any[];
  revealedRegions: string[];
  markers: Record<string, any>;
  status: string;
}

export interface SessionSocketState {
  connection: "idle" | "connecting" | "open" | "closed";
  lastEvent: string | null;
  state: SessionStateMessage | null;
  players: { id: string; name: string; role: string }[];
  send: (payload: unknown) => void;
  reconnect: () => void;
}

export const useSessionSocket = (sessionId: string | null, identity: { name: string; role: "dm" | "player" }) => {
  const [connection, setConnection] = useState<SessionSocketState["connection"]>("idle");
  const [state, setState] = useState<SessionStateMessage | null>(null);
  const [players, setPlayers] = useState<SessionSocketState["players"]>([]);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectToken = useRef(0);

  const connect = useCallback(() => {
    if (!sessionId) return;
    const url = apiClient.socketUrl(sessionId);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setConnection("connecting");

    ws.addEventListener("open", () => {
      setConnection("open");
      ws.send(JSON.stringify({ type: "join", name: identity.name, role: identity.role }));
    });

    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "state":
            setState(data.state ?? null);
            break;
          case "regionsRevealed":
            setLastEvent(`Revealed ${data.regionIds?.length ?? 0} region(s)`);
            setState((prev) => (prev ? { ...prev, revealedRegions: Array.from(new Set([...(prev.revealedRegions ?? []), ...(data.regionIds ?? [])])) } : prev));
            break;
          case "regionsHidden":
            setLastEvent(`Hid ${data.regionIds?.length ?? 0} region(s)`);
            setState((prev) => (prev ? { ...prev, revealedRegions: prev.revealedRegions.filter((id) => !(data.regionIds ?? []).includes(id)) } : prev));
            break;
          case "markerAdded":
          case "markerUpdated":
            setLastEvent(`Marker ${data.marker?.name ?? data.marker?.id ?? "updated"}`);
            setState((prev) => {
              if (!prev) return prev;
              const markers = { ...prev.markers, [data.marker.id]: data.marker };
              return { ...prev, markers };
            });
            break;
          case "markerRemoved":
            setLastEvent(`Marker removed`);
            setState((prev) => {
              if (!prev) return prev;
              const markers = { ...prev.markers };
              delete markers[data.markerId];
              return { ...prev, markers };
            });
            break;
          case "players":
            setPlayers(data.players ?? []);
            break;
          case "pong":
            setLastEvent("pong");
            break;
          default:
            break;
        }
      } catch (err) {
        console.warn("Failed to parse session message", err);
      }
    });

    ws.addEventListener("close", () => {
      setConnection("closed");
    });

    ws.addEventListener("error", () => {
      setConnection("closed");
    });
  }, [identity.name, identity.role, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [sessionId, reconnectToken.current, connect]);

  useEffect(() => {
    const pingInterval = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);
    return () => clearInterval(pingInterval);
  }, []);

  const send = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const reconnect = useCallback(() => {
    reconnectToken.current += 1;
    wsRef.current?.close();
    connect();
  }, [connect]);

  return useMemo<SessionSocketState>(() => ({ connection, state, players, lastEvent, send, reconnect }), [connection, state, players, lastEvent, send, reconnect]);
};
