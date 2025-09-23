import type { Bounds, Point } from '../../types/geometry';
import type { RoomMask } from '../../utils/roomMask';
import type { SelectionState } from '../../state/selection';
import { useSegmentation } from './segmentationHelpers';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const computeBounds = (points: Point[]): Bounds => {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
};

const expandBounds = (bounds: Bounds, padding: number): Bounds => ({
  minX: clamp01(bounds.minX - padding),
  minY: clamp01(bounds.minY - padding),
  maxX: clamp01(bounds.maxX + padding),
  maxY: clamp01(bounds.maxY + padding),
});

const buildFreehandMask = (ctx: ToolContext, points: Point[]): RoomMask | null => {
  if (points.length < 3) {
    return null;
  }
  const baseBounds = computeBounds(points);
  const rangeX = baseBounds.maxX - baseBounds.minX;
  const rangeY = baseBounds.maxY - baseBounds.minY;
  const padding = Math.max(rangeX, rangeY) * 0.12 + 0.015;
  const bounds = expandBounds(baseBounds, padding);
  const widthRatio = bounds.maxX - bounds.minX || 1;
  const heightRatio = bounds.maxY - bounds.minY || 1;
  const maxDimension = Math.max(widthRatio, heightRatio) || 1;
  const baseResolution = 896;
  const scale = baseResolution / Math.max(maxDimension, 0.02);
  const width = Math.max(48, Math.min(1200, Math.round(Math.max(widthRatio, 0.02) * scale)));
  const height = Math.max(48, Math.min(1200, Math.round(Math.max(heightRatio, 0.02) * scale)));
  const localPoints = points.map((point) => ({
    x: clamp01((point.x - bounds.minX) / widthRatio),
    y: clamp01((point.y - bounds.minY) / heightRatio),
  }));
  const strokeRadius = Math.max(1 / Math.max(width, height), 0.0025);
  const boundary = useSegmentation(ctx.segmentation, 'rasterizeFreehandPath', localPoints, width, height, {
    strokeRadius,
    closePath: true,
  });
  const filled = useSegmentation(ctx.segmentation, 'fillMaskInterior', boundary, width, height);
  return {
    width,
    height,
    bounds,
    data: filled,
  };
};

interface EnergyContext {
  data: Float32Array;
  width: number;
  height: number;
}

const getEnergyContext = (ctx: ToolContext): EnergyContext | null => {
  if (!ctx.raster) {
    return null;
  }
  if (ctx.raster.edgeEnergy && ctx.raster.edgeEnergy.length === ctx.raster.width * ctx.raster.height) {
    return {
      data: ctx.raster.edgeEnergy,
      width: ctx.raster.width,
      height: ctx.raster.height,
    };
  }
  if (!ctx.segmentation) {
    return null;
  }
  const layers = Array.isArray(ctx.raster.layers) ? ctx.raster.layers : [ctx.raster.layers];
  const source = layers[0];
  if (!source) {
    return null;
  }
  const energy = useSegmentation(ctx.segmentation, 'edgeEnergyMultiScale', source, ctx.raster.width, ctx.raster.height, {
    scales: 3,
    baseSigma: 0.8,
  });
  return { data: energy, width: ctx.raster.width, height: ctx.raster.height };
};

const sampleEnergyForMask = (mask: RoomMask, context: EnergyContext): Float32Array => {
  const result = new Float32Array(mask.width * mask.height);
  const { bounds } = mask;
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  const maxX = context.width - 1;
  const maxY = context.height - 1;
  for (let y = 0; y < mask.height; y += 1) {
    const v = bounds.minY + ((y + 0.5) / mask.height) * scaleY;
    const sourceY = clamp01(v) * maxY;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(maxY, y0 + 1);
    const wy = sourceY - y0;
    for (let x = 0; x < mask.width; x += 1) {
      const u = bounds.minX + ((x + 0.5) / mask.width) * scaleX;
      const sourceX = clamp01(u) * maxX;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(maxX, x0 + 1);
      const wx = sourceX - x0;
      const i00 = context.data[y0 * context.width + x0];
      const i10 = context.data[y0 * context.width + x1];
      const i01 = context.data[y1 * context.width + x0];
      const i11 = context.data[y1 * context.width + x1];
      const top = i00 * (1 - wx) + i10 * wx;
      const bottom = i01 * (1 - wx) + i11 * wx;
      result[y * mask.width + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return result;
};

const refineMask = (
  ctx: ToolContext,
  mask: RoomMask,
  energyContext: EnergyContext | null,
  selection: SelectionState,
): RoomMask => {
  let refined = mask.data;
  if (energyContext) {
    const stickiness = clamp01(selection.smartStickiness ?? 0.55);
    const edgeThreshold = clamp01(0.2 + stickiness * 0.5);
    const edgeWidth = Math.min(Math.max(selection.edgeRefinementWidth ?? 0.02, 0.005), 0.25);
    const bandSize = Math.max(1, Math.round(Math.max(mask.width, mask.height) * edgeWidth));
    const sampled = sampleEnergyForMask(mask, energyContext);
    refined = useSegmentation(
      ctx.segmentation,
      'refineBoundaryToEdges',
      mask.data,
      mask.width,
      mask.height,
      sampled,
      {
        bandSize,
        edgeThreshold,
        connectivity: 8,
      },
    );
  }
  const featherAmount = Math.min(Math.max(selection.selectionFeather ?? 0.015, 0), 0.25);
  const featherRadius = Math.round(Math.max(mask.width, mask.height) * featherAmount);
  const feathered = useSegmentation(ctx.segmentation, 'featherMask', refined, mask.width, mask.height, featherRadius);
  const dilationRadius = selection.dilateBy5px ? Math.max(0, Math.round(Math.max(mask.width, mask.height) * 0.01)) : 0;
  const finalMask =
    dilationRadius > 0
      ? useSegmentation(ctx.segmentation, 'dilateMask', feathered, mask.width, mask.height, dilationRadius)
      : feathered;
  return { ...mask, data: finalMask };
};

export class SmartLassoTool implements DefineRoomsTool {
  readonly id = 'smartLasso';

  private active = false;

  private rawPoints: Point[] = [];

  private energy: EnergyContext | null = null;

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }
    const start = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    this.active = true;
    this.rawPoints = [start];
    this.energy = getEnergyContext(ctx);
    ctx.store.previewMask(null);
  }

  onPointerMove(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const point = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    if (this.rawPoints.length === 0) {
      this.rawPoints.push(point);
    } else {
      const last = this.rawPoints[this.rawPoints.length - 1];
      if (distance(last, point) > 0.002) {
        this.rawPoints.push(point);
      } else {
        this.rawPoints[this.rawPoints.length - 1] = point;
      }
    }
    const preview = buildFreehandMask(ctx, this.rawPoints);
    if (preview) {
      const selection = this.store.getState().selection;
      ctx.store.previewMask(refineMask(ctx, preview, null, selection));
    }
  }

  onPointerUp(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const end = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    if (this.rawPoints.length === 0 || distance(this.rawPoints[this.rawPoints.length - 1], end) > 0.002) {
      this.rawPoints.push(end);
    } else {
      this.rawPoints[this.rawPoints.length - 1] = end;
    }
    const mask = buildFreehandMask(ctx, this.rawPoints);
    this.active = false;
    this.rawPoints = [];
    ctx.store.previewMask(null);
    if (!mask) {
      return;
    }
    if (this.energy) {
      ctx.store.setBusy('Refining edges…');
    }
    try {
      const selection = this.store.getState().selection;
      const refined = refineMask(ctx, mask, this.energy, selection);
      ctx.store.commitMask(refined);
    } finally {
      if (this.energy) {
        ctx.store.setBusy(null);
      }
      this.energy = null;
    }
  }

  onCancel(ctx: ToolContext) {
    this.active = false;
    this.rawPoints = [];
    this.energy = null;
    ctx.store.setBusy(null);
    ctx.store.previewMask(null);
  }
}

export const createSmartLassoTool = () => new SmartLassoTool();

