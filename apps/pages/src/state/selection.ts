export type SelectionTool = 'magneticLasso' | 'smartWand';

export interface SelectionState {
  polygon: Array<{ x: number; y: number }> | null;
  tool: SelectionTool | null;
  entranceLocked: boolean;
  lockedEntranceId: string | null;
  cacheKey: string | null;
  lastUpdated: number;
}

const defaultState: SelectionState = {
  polygon: null,
  tool: null,
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

const setState = (updater: (current: SelectionState) => SelectionState) => {
  state = updater(state);
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
  setSelection(
    tool: SelectionTool,
    polygon: Array<{ x: number; y: number }> | null,
    options?: { entranceLocked?: boolean; lockedEntranceId?: string | null; cacheKey?: string | null }
  ) {
    setState((current) => ({
      polygon: polygon ? polygon.map((point) => ({ x: point.x, y: point.y })) : null,
      tool,
      entranceLocked: options?.entranceLocked ?? false,
      lockedEntranceId: options?.lockedEntranceId ?? null,
      cacheKey: options?.cacheKey ?? current.cacheKey,
      lastUpdated: Date.now(),
    }));
  },
  clearSelection() {
    setState(() => ({ ...defaultState, lastUpdated: Date.now() }));
  },
  setEntranceLocked(locked: boolean, entranceId?: string | null) {
    setState((current) => ({
      ...current,
      entranceLocked: locked,
      lockedEntranceId: entranceId ?? current.lockedEntranceId,
      lastUpdated: Date.now(),
    }));
  },
};

export type SelectionStore = typeof selectionStore;

