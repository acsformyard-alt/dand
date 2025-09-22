import {
  smartWand as runSmartWand,
  type EntranceZone,
  type SmartWandRequest,
  type SmartWandResult,
} from '../workers/seg';
import type { RasterImageData } from '../utils/roomToolUtils';
import { selectionStore } from '../state/selection';

export interface SmartWandOptions {
  raster: RasterImageData;
  roi?: SmartWandRequest['roi'];
  cacheKey?: string;
  entranceZones?: EntranceZone[];
  config?: SmartWandRequest['config'];
  colorTolerance?: number;
  gradientThreshold?: number;
  maxPixels?: number;
  rngSeed?: number;
}

export interface SmartWandDebugOverlay {
  mask: Uint8Array | null;
  entranceLocked: boolean;
  lockedEntranceId: string | null;
  iterations: number;
  accepted: number;
  frontier: number;
  cacheHit: boolean;
}

export class SmartWandTool {
  private raster: RasterImageData | null = null;

  private roi: SmartWandRequest['roi'] = null;

  private cacheKey: string | undefined;

  private config: SmartWandRequest['config'];

  private colorTolerance: number | undefined;

  private gradientThreshold: number | undefined;

  private maxPixels: number | undefined;

  private rngSeed: number | undefined;

  private entranceZones: EntranceZone[] = [];

  private lastResult: SmartWandResult | null = null;

  private listeners = new Set<() => void>();

  private lockedEntranceId: string | null = null;

  constructor(options?: SmartWandOptions) {
    if (options) {
      this.configure(options);
    }
  }

  configure(options: SmartWandOptions) {
    this.raster = options.raster;
    this.roi = options.roi ?? null;
    this.cacheKey = options.cacheKey;
    this.config = options.config;
    this.colorTolerance = options.colorTolerance;
    this.gradientThreshold = options.gradientThreshold;
    this.maxPixels = options.maxPixels;
    this.entranceZones = options.entranceZones ?? [];
    this.rngSeed = options.rngSeed;
    this.lastResult = null;
    this.lockedEntranceId = null;
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  getResult() {
    return this.lastResult;
  }

  setEntranceZones(zones: EntranceZone[]) {
    this.entranceZones = zones;
    this.notify();
  }

  setLockedEntranceId(entranceId: string | null) {
    this.lockedEntranceId = entranceId;
    this.notify();
  }

  clearSelection() {
    this.lastResult = null;
    this.lockedEntranceId = null;
    selectionStore.clearSelection();
    this.notify();
  }

  select(point: { x: number; y: number }) {
    if (!this.raster) {
      return null;
    }
    const request: SmartWandRequest = {
      raster: this.raster,
      seed: point,
      roi: this.roi,
      cacheKey: this.cacheKey,
      config: this.config,
      colorTolerance: this.colorTolerance,
      gradientThreshold: this.gradientThreshold,
      maxPixels: this.maxPixels,
      entranceZones: this.entranceZones,
      lockEntranceId: this.lockedEntranceId,
      rngSeed: this.rngSeed,
    };
    const result = runSmartWand(request);
    this.lastResult = result;
    if (result.entranceLocked) {
      this.lockedEntranceId = result.lockedEntranceId;
    }
    selectionStore.setSelection('smartWand', result.polygon, {
      entranceLocked: result.entranceLocked,
      lockedEntranceId: result.lockedEntranceId,
    });
    this.notify();
    return result;
  }

  getDebugOverlay(): SmartWandDebugOverlay {
    return {
      mask: this.lastResult?.mask ?? null,
      entranceLocked: this.lastResult?.entranceLocked ?? false,
      lockedEntranceId: this.lastResult?.lockedEntranceId ?? null,
      iterations: this.lastResult?.debug.iterations ?? 0,
      accepted: this.lastResult?.debug.accepted ?? 0,
      frontier: this.lastResult?.debug.frontier ?? 0,
      cacheHit: this.lastResult?.debug.cacheHit ?? false,
    };
  }
}

export const createSmartWandTool = (options: SmartWandOptions) => new SmartWandTool(options);

