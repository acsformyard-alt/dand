import { cloneRoomMask, type RoomMask } from '../utils/roomMask';

export type SelectionTool = 'smartLasso' | 'lasso' | 'autoWand' | 'refineBrush';

export interface SelectionState {
  mask: RoomMask | null;
  tool: SelectionTool | null;
  brushRadius: number;
  wandTolerance: number;
  wandConnectivity: 4 | 8;
  snapStrength: number;
  entranceLocked: boolean;
  lockedEntranceId: string | null;
  cacheKey: string | null;
  lastUpdated: number;
}

const defaultState: SelectionState = {
  mask: null,
  tool: null,
  brushRadius: 0.08,
  wandTolerance: 0.15,
  wandConnectivity: 8,
  snapStrength: 0.65,
  entranceLocked: false,
  lockedEntranceId: null,
  cacheKey: null,
  lastUpdated: 0,
};

let state: SelectionState = { ...defaultState };

const listeners = new Set<(next: SelectionState) => void>();

const notify = () => {
  listeners.forEach((listener) => listener(state));
};

const commit = (updater: (current: SelectionState) => SelectionState) => {
  state = { ...updater(state), lastUpdated: Date.now() };
  notify();
};

export const selectionStore = {
  getState: () => state,
  subscribe(listener: (next: SelectionState) => void) {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },
  setTool(tool: SelectionTool | null) {
    commit((current) => ({ ...current, tool }));
  },
  setSelection(
    tool: SelectionTool,
    mask: RoomMask | null,
    options?: {
      entranceLocked?: boolean;
      lockedEntranceId?: string | null;
      cacheKey?: string | null;
      brushRadius?: number;
      wandTolerance?: number;
      wandConnectivity?: 4 | 8;
      snapStrength?: number;
    },
  ) {
    commit((current) => ({
      mask: mask ? cloneRoomMask(mask) : null,
      tool,
      brushRadius: options?.brushRadius ?? current.brushRadius,
      wandTolerance: options?.wandTolerance ?? current.wandTolerance,
      wandConnectivity: options?.wandConnectivity ?? current.wandConnectivity,
      snapStrength: options?.snapStrength ?? current.snapStrength,
      entranceLocked: options?.entranceLocked ?? false,
      lockedEntranceId: options?.lockedEntranceId ?? null,
      cacheKey: options?.cacheKey ?? current.cacheKey,
      lastUpdated: Date.now(),
    }));
  },
  updateMask(mask: RoomMask | null) {
    commit((current) => ({ ...current, mask: mask ? cloneRoomMask(mask) : null }));
  },
  setBrushRadius(radius: number) {
    commit((current) => ({ ...current, brushRadius: Math.min(Math.max(radius, 0.01), 0.5) }));
  },
  setWandTolerance(tolerance: number) {
    commit((current) => ({ ...current, wandTolerance: Math.min(Math.max(tolerance, 0), 1) }));
  },
  setWandConnectivity(connectivity: 4 | 8) {
    commit((current) => ({ ...current, wandConnectivity: connectivity }));
  },
  setSnapStrength(strength: number) {
    commit((current) => ({ ...current, snapStrength: Math.min(Math.max(strength, 0), 1) }));
  },
  clearSelection() {
    commit(() => ({ ...defaultState, lastUpdated: Date.now() }));
  },
  setEntranceLocked(locked: boolean, entranceId?: string | null) {
    commit((current) => ({
      ...current,
      entranceLocked: locked,
      lockedEntranceId: entranceId ?? current.lockedEntranceId,
    }));
  },
};

export const createEmptySelectionState = (): SelectionState => ({
  ...defaultState,
  lastUpdated: Date.now(),
});

export type SelectionStore = typeof selectionStore;
