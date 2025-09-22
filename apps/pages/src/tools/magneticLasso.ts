import { liveWirePath, vectorizeAndSnap, type LiveWireRequest } from '../workers/seg';
import type { RasterImageData } from '../utils/roomToolUtils';
import { selectionStore } from '../state/selection';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface MagneticLassoAnchor {
  x: number;
  y: number;
}

export interface MagneticLassoOptions {
  raster: RasterImageData;
  roi?: LiveWireRequest['roi'];
  cacheKey?: string;
  previewSamples?: number;
  liveWireConfig?: LiveWireRequest['config'];
}

export interface MagneticLassoPreview {
  path: Array<{ x: number; y: number }>;
  cost: number;
  cacheHit: boolean;
}

export interface MagneticLassoFinalizeOptions {
  smoothingIterations?: number;
  snapSearchRadius?: number;
}

export interface MagneticLassoDebugOverlay {
  anchors: MagneticLassoAnchor[];
  previewPath: Array<{ x: number; y: number }>;
  committedPath: Array<{ x: number; y: number }>;
  previewComputations: number;
  lastPreviewCost: number;
}

const MIN_MOVE_DELTA = 0.003;

export class MagneticLassoTool {
  private anchors: MagneticLassoAnchor[] = [];

  private committedPath: Array<{ x: number; y: number }> = [];

  private preview: MagneticLassoPreview | null = null;

  private raster: RasterImageData | null = null;

  private roi: LiveWireRequest['roi'] = null;

  private cacheKey: string | undefined;

  private liveWireConfig: LiveWireRequest['config'];

  private listeners = new Set<() => void>();

  private previewComputations = 0;

  private lastPreviewPoint: { x: number; y: number } | null = null;

  constructor(options?: MagneticLassoOptions) {
    if (options) {
      this.configure(options);
    }
  }

  configure(options: MagneticLassoOptions) {
    this.raster = options.raster;
    this.roi = options.roi ?? null;
    this.cacheKey = options.cacheKey;
    this.liveWireConfig = options.liveWireConfig;
    this.reset();
  }

  reset() {
    this.anchors = [];
    this.committedPath = [];
    this.preview = null;
    this.previewComputations = 0;
    this.lastPreviewPoint = null;
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

  getAnchors() {
    return [...this.anchors];
  }

  getCommittedPath() {
    return [...this.committedPath];
  }

  getPreview() {
    return this.preview ? { ...this.preview, path: [...this.preview.path] } : null;
  }

  private rasterizePolygon(
    points: Array<{ x: number; y: number }>,
    width: number,
    height: number
  ) {
    const mask = new Uint8Array(width * height);
    if (points.length < 3) {
      return mask;
    }
    const pixels = points.map((point) => ({
      x: point.x * (width - 1),
      y: point.y * (height - 1),
    }));
    for (let y = 0; y < height; y += 1) {
      const intersections: number[] = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const ay = pixels[i].y;
        const by = pixels[j].y;
        const ax = pixels[i].x;
        const bx = pixels[j].x;
        const intersects = (ay <= y && by > y) || (by <= y && ay > y);
        if (!intersects) continue;
        const ratio = (y - ay) / (by - ay + Number.EPSILON);
        const x = ax + (bx - ax) * ratio;
        intersections.push(x);
      }
      intersections.sort((a, b) => a - b);
      for (let index = 0; index < intersections.length; index += 2) {
        const start = Math.max(0, Math.floor(intersections[index]));
        const end = Math.min(width - 1, Math.ceil(intersections[index + 1] ?? intersections[index]));
        for (let x = start; x <= end; x += 1) {
          mask[y * width + x] = 1;
        }
      }
    }
    return mask;
  }

  private addPathSegment(path: Array<{ x: number; y: number }>) {
    if (path.length === 0) return;
    if (this.committedPath.length === 0) {
      this.committedPath.push(...path);
      return;
    }
    const [first] = path;
    const lastCommitted = this.committedPath[this.committedPath.length - 1];
    if (first && lastCommitted && first.x === lastCommitted.x && first.y === lastCommitted.y) {
      this.committedPath.push(...path.slice(1));
    } else {
      this.committedPath.push(...path);
    }
  }

  private requestPath(endPoint: { x: number; y: number }) {
    if (!this.raster || this.anchors.length === 0) {
      return null;
    }
    const startAnchor = this.anchors[this.anchors.length - 1];
    const request: LiveWireRequest = {
      raster: this.raster,
      start: startAnchor,
      end: endPoint,
      roi: this.roi,
      cacheKey: this.cacheKey,
      config: this.liveWireConfig,
    };
    const result = liveWirePath(request);
    this.previewComputations += 1;
    return result;
  }

  pointerDown(point: { x: number; y: number }) {
    if (!this.raster) return;
    if (this.anchors.length === 0) {
      this.anchors.push(point);
      this.committedPath.push(point);
      this.notify();
      return;
    }
    const pathResult = this.requestPath(point);
    if (pathResult) {
      this.anchors.push(point);
      this.addPathSegment(pathResult.path);
      this.preview = pathResult;
      this.notify();
    }
  }

  pointerMove(point: { x: number; y: number }) {
    if (!this.raster || this.anchors.length === 0) return;
    if (this.lastPreviewPoint) {
      const dx = Math.abs(point.x - this.lastPreviewPoint.x);
      const dy = Math.abs(point.y - this.lastPreviewPoint.y);
      if (Math.max(dx, dy) < MIN_MOVE_DELTA) {
        return;
      }
    }
    this.lastPreviewPoint = point;
    const result = this.requestPath(point);
    if (result) {
      this.preview = result;
      this.notify();
    }
  }

  undoLastAnchor() {
    if (this.anchors.length <= 1) {
      this.reset();
      return;
    }
    this.anchors.pop();
    const lastAnchor = this.anchors[this.anchors.length - 1];
    this.committedPath = this.committedPath.filter((point, index) => {
      if (index === 0) return true;
      const next = this.committedPath[index - 1];
      return !(point.x === lastAnchor.x && point.y === lastAnchor.y && next.x === lastAnchor.x && next.y === lastAnchor.y);
    });
    this.preview = null;
    this.notify();
  }

  finalize(options: MagneticLassoFinalizeOptions = {}) {
    if (!this.raster || this.anchors.length < 2) {
      return null;
    }
    const firstAnchor = this.anchors[0];
    const lastAnchor = this.anchors[this.anchors.length - 1];
    if (firstAnchor.x !== lastAnchor.x || firstAnchor.y !== lastAnchor.y) {
      const closingPath = this.requestPath(firstAnchor);
      if (closingPath) {
        this.addPathSegment(closingPath.path);
      }
    }
    const rasterWidth = this.raster.width;
    const rasterHeight = this.raster.height;
    const maskWidth = this.roi ? Math.floor(this.roi.width) : rasterWidth;
    const maskHeight = this.roi ? Math.floor(this.roi.height) : rasterHeight;
    const fillPolygon = this.committedPath.length > 0 ? this.committedPath : this.anchors;
    const polygonLocal = fillPolygon.map((point) => {
      if (!this.roi) {
        return { x: point.x, y: point.y };
      }
      const roiWidth = Math.max(1, this.roi.width);
      const roiHeight = Math.max(1, this.roi.height);
      const px = clamp(point.x, 0, 1) * rasterWidth;
      const py = clamp(point.y, 0, 1) * rasterHeight;
      const localX = (px - this.roi.x) / roiWidth;
      const localY = (py - this.roi.y) / roiHeight;
      return { x: clamp(localX, 0, 1), y: clamp(localY, 0, 1) };
    });
    const mask = this.rasterizePolygon(polygonLocal, maskWidth, maskHeight);
    const result = vectorizeAndSnap({
      raster: this.raster,
      mask,
      maskWidth,
      maskHeight,
      roi: this.roi ?? undefined,
      cacheKey: this.cacheKey,
      smoothingIterations: options.smoothingIterations ?? 1,
      snapSearchRadius: options.snapSearchRadius ?? 32,
    });
    selectionStore.setSelection('magneticLasso', result.snappedPolygon, {
      entranceLocked: false,
      lockedEntranceId: null,
    });
    this.notify();
    return result;
  }

  getDebugOverlay(): MagneticLassoDebugOverlay {
    return {
      anchors: [...this.anchors],
      previewPath: this.preview ? [...this.preview.path] : [],
      committedPath: [...this.committedPath],
      previewComputations: this.previewComputations,
      lastPreviewCost: this.preview?.cost ?? 0,
    };
  }
}

export const createMagneticLassoTool = (options: MagneticLassoOptions) => new MagneticLassoTool(options);

