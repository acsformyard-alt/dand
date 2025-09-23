import { cloneRoomMask, type RoomMask } from '../utils/roomMask';

export type SelectionTool = 'smartLasso' | 'lasso' | 'autoWand' | 'paintbrush';

export interface SelectionState {
  mask: RoomMask | null;
  tool: SelectionTool | null;
  brushRadius: number;
  brushHardness: number;
  wandTolerance: number;
  wandConnectivity: 4 | 8;
  wandContiguous: boolean;
  wandSampleAllLayers: boolean;
  wandAntiAlias: boolean;
  snapStrength: number;
  selectionFeather: number;
  smartStickiness: number;
  edgeRefinementWidth: number;
  dilateBy5px: boolean;
  entranceLocked: boolean;
  lockedEntranceId: string | null;
  cacheKey: string | null;
  lastUpdated: number;
}

const defaultState: SelectionState = {
  mask: null,
  tool: null,
  brushRadius: 0.08,
  brushHardness: 0.85,
  wandTolerance: 0.25,
  wandConnectivity: 8,
  wandContiguous: true,
  wandSampleAllLayers: false,
  wandAntiAlias: true,
  snapStrength: 0.65,
  selectionFeather: 0.015,
  smartStickiness: 0.55,
  edgeRefinementWidth: 0.02,
  dilateBy5px: false,
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
      brushHardness?: number;
      wandTolerance?: number;
      wandConnectivity?: 4 | 8;
      wandContiguous?: boolean;
      wandSampleAllLayers?: boolean;
      wandAntiAlias?: boolean;
      snapStrength?: number;
      selectionFeather?: number;
      smartStickiness?: number;
      edgeRefinementWidth?: number;
      dilateBy5px?: boolean;
    },
  ) {
    commit((current) => ({
      mask: mask ? cloneRoomMask(mask) : null,
      tool,
      brushRadius: options?.brushRadius ?? current.brushRadius,
      brushHardness: options?.brushHardness ?? current.brushHardness,
      wandTolerance: options?.wandTolerance ?? current.wandTolerance,
      wandConnectivity: options?.wandConnectivity ?? current.wandConnectivity,
      wandContiguous: options?.wandContiguous ?? current.wandContiguous,
      wandSampleAllLayers: options?.wandSampleAllLayers ?? current.wandSampleAllLayers,
      wandAntiAlias: options?.wandAntiAlias ?? current.wandAntiAlias,
      snapStrength: options?.snapStrength ?? current.snapStrength,
      selectionFeather: options?.selectionFeather ?? current.selectionFeather,
      smartStickiness: options?.smartStickiness ?? current.smartStickiness,
      edgeRefinementWidth: options?.edgeRefinementWidth ?? current.edgeRefinementWidth,
      dilateBy5px: options?.dilateBy5px ?? current.dilateBy5px,
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
  setBrushHardness(hardness: number) {
    commit((current) => ({ ...current, brushHardness: Math.min(Math.max(hardness, 0), 1) }));
  },
  setWandTolerance(tolerance: number) {
    commit((current) => ({ ...current, wandTolerance: Math.min(Math.max(tolerance, 0), 1) }));
  },
  setWandConnectivity(connectivity: 4 | 8) {
    commit((current) => ({ ...current, wandConnectivity: connectivity }));
  },
  setWandContiguous(contiguous: boolean) {
    commit((current) => ({ ...current, wandContiguous: Boolean(contiguous) }));
  },
  setWandSampleAllLayers(sampleAllLayers: boolean) {
    commit((current) => ({ ...current, wandSampleAllLayers: Boolean(sampleAllLayers) }));
  },
  setWandAntiAlias(antiAlias: boolean) {
    commit((current) => ({ ...current, wandAntiAlias: Boolean(antiAlias) }));
  },
  setSnapStrength(strength: number) {
    commit((current) => ({ ...current, snapStrength: Math.min(Math.max(strength, 0), 1) }));
  },
  setSelectionFeather(feather: number) {
    commit((current) => ({ ...current, selectionFeather: Math.min(Math.max(feather, 0), 0.25) }));
  },
  setSmartStickiness(stickiness: number) {
    commit((current) => ({ ...current, smartStickiness: Math.min(Math.max(stickiness, 0), 1) }));
  },
  setEdgeRefinementWidth(width: number) {
    commit((current) => ({ ...current, edgeRefinementWidth: Math.min(Math.max(width, 0.005), 0.25) }));
  },
  setDilateBy5px(enabled: boolean) {
    commit((current) => ({ ...current, dilateBy5px: Boolean(enabled) }));
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
