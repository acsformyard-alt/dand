import { createEmptySelectionState, type SelectionState, type SelectionTool } from './selection';
import {
  applyCircularBrushToMask,
  cloneRoomMask,
  createRoomMaskFromPolygon,
  emptyRoomMask,
  roomMaskToPolygon,
  type RoomMask,
} from '../utils/roomMask';
import type { Bounds, Point } from '../types/geometry';

export interface GapMarker {
  id: string;
  position: Point;
  radius: number;
  severity: 'info' | 'warning' | 'error';
  description: string;
}

export interface SignedDistanceField {
  width: number;
  height: number;
  bounds: Bounds;
  values: Float32Array;
}

export interface RoundTripResult {
  sdf: SignedDistanceField;
  mask: RoomMask;
  polygon: Point[];
  error: number;
}

export interface SdfOptions {
  resolution?: number;
  padding?: number;
}

export interface RoundTripOptions extends SdfOptions {
  threshold?: number;
}

export interface DefineRoomsState {
  mode: 'idle' | 'editing';
  selection: SelectionState;
  previewMask: RoomMask | null;
  busyMessage: string | null;
  gapMarkers: GapMarker[];
  signedDistanceField: SignedDistanceField | null;
  lastRoundTrip: RoundTripResult | null;
  lastUpdated: number;
}

export type DefineRoomsListener = (state: DefineRoomsState) => void;

export interface DefineRoomsStore {
  getState(): DefineRoomsState;
  subscribe(listener: DefineRoomsListener): () => void;
  setMode(mode: DefineRoomsState['mode']): void;
  setBusy(message: string | null): void;
  setSelection(selection: SelectionState): void;
  setTool(tool: SelectionTool | null): void;
  previewMask(mask: RoomMask | null): void;
  commitMask(mask: RoomMask): void;
  applyBrush(point: Point, radius: number, mode: 'add' | 'erase'): void;
  clear(): void;
  setGapMarkers(markers: GapMarker[]): void;
  refreshGapMarkers(): void;
  setSignedDistanceField(field: SignedDistanceField | null): void;
  setLastRoundTrip(result: RoundTripResult | null): void;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const computeGapMarkers = (mask: RoomMask | null): GapMarker[] => {
  if (!mask) {
    return [];
  }
  const polygon = roomMaskToPolygon(mask);
  if (polygon.length < 2) {
    return [];
  }
  const markers: GapMarker[] = [];
  const threshold = 0.075;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const gap = distance(current, next);
    if (gap <= threshold) {
      continue;
    }
    const radius = gap / 2;
    const severity = gap > threshold * 1.6 ? 'error' : gap > threshold * 1.2 ? 'warning' : 'info';
    markers.push({
      id: `gap-${i}`,
      position: { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
      radius,
      severity,
      description: `Gap of ${(gap * 100).toFixed(1)}% between mask edges`,
    });
  }
  return markers;
};

const defaultState: DefineRoomsState = {
  mode: 'idle',
  selection: createEmptySelectionState(),
  previewMask: null,
  busyMessage: null,
  gapMarkers: [],
  signedDistanceField: null,
  lastRoundTrip: null,
  lastUpdated: Date.now(),
};

let state: DefineRoomsState = { ...defaultState, selection: { ...defaultState.selection } };

const listeners = new Set<DefineRoomsListener>();

const notify = () => {
  listeners.forEach((listener) => listener(state));
};

const commitState = (updater: (current: DefineRoomsState) => DefineRoomsState) => {
  state = { ...updater(state), lastUpdated: Date.now() };
  notify();
};

const withSelection = (updater: (selection: SelectionState) => SelectionState) => {
  commitState((current) => ({ ...current, selection: updater(current.selection) }));
};

const ensureMask = (mask: RoomMask | null) => mask ?? emptyRoomMask();

export const defineRoomsStore: DefineRoomsStore = {
  getState: () => state,
  subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },
  setMode(mode) {
    commitState((current) => ({ ...current, mode }));
  },
  setBusy(message) {
    commitState((current) => ({ ...current, busyMessage: message }));
  },
  setSelection(selection) {
    commitState((current) => ({
      ...current,
      selection: {
        ...selection,
        mask: selection.mask ? cloneRoomMask(selection.mask) : null,
        lastUpdated: Date.now(),
      },
      gapMarkers: computeGapMarkers(selection.mask ?? null),
    }));
  },
  setTool(tool) {
    withSelection((selection) => ({ ...selection, tool }));
  },
  previewMask(mask) {
    commitState((current) => ({ ...current, previewMask: mask ? cloneRoomMask(mask) : null }));
  },
  commitMask(mask) {
    commitState((current) => ({
      ...current,
      mode: 'editing',
      selection: {
        ...current.selection,
        mask: cloneRoomMask(mask),
        lastUpdated: Date.now(),
      },
      previewMask: null,
      gapMarkers: computeGapMarkers(mask),
    }));
  },
  applyBrush(point, radius, mode) {
    commitState((current) => {
      const baseMask = ensureMask(current.selection.mask);
      const mutated = applyCircularBrushToMask(
        baseMask,
        point,
        radius,
        mode,
        current.selection.brushHardness ?? 1
      );
      return {
        ...current,
        selection: {
          ...current.selection,
          mask: mutated,
          lastUpdated: Date.now(),
        },
        gapMarkers: computeGapMarkers(mutated),
      };
    });
  },
  clear() {
    commitState(() => ({ ...defaultState, selection: createEmptySelectionState(), lastUpdated: Date.now() }));
  },
  setGapMarkers(markers) {
    commitState((current) => ({ ...current, gapMarkers: markers.slice() }));
  },
  refreshGapMarkers() {
    commitState((current) => ({ ...current, gapMarkers: computeGapMarkers(current.selection.mask ?? null) }));
  },
  setSignedDistanceField(field) {
    commitState((current) => ({ ...current, signedDistanceField: field }));
  },
  setLastRoundTrip(result) {
    commitState((current) => ({ ...current, lastRoundTrip: result }));
  },
};

export const polygonToRoomMask = (polygon: Point[], options?: SdfOptions): RoomMask =>
  createRoomMaskFromPolygon(polygon, { resolution: options?.resolution, padding: options?.padding });

export const roomMaskToVector = (mask: RoomMask): Point[] => roomMaskToPolygon(mask);
