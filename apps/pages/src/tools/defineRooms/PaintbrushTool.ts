import type { Point } from '../../types/geometry';
import { cloneRoomMask, type RoomMask } from '../../utils/roomMask';
import { useSegmentation } from './segmentationHelpers';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

const createDefaultMask = (resolution = 512): RoomMask => ({
  width: resolution,
  height: resolution,
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  data: new Uint8ClampedArray(resolution * resolution),
});

const toMaskSpace = (mask: RoomMask, point: Point) => {
  const width = mask.bounds.maxX - mask.bounds.minX || 1;
  const height = mask.bounds.maxY - mask.bounds.minY || 1;
  return {
    x: clamp01(width === 0 ? 0.5 : (point.x - mask.bounds.minX) / width),
    y: clamp01(height === 0 ? 0.5 : (point.y - mask.bounds.minY) / height),
  };
};

const computeStrokeRadius = (mask: RoomMask, radius: number) => {
  const maxAxis = Math.max(mask.bounds.maxX - mask.bounds.minX, mask.bounds.maxY - mask.bounds.minY) || 1;
  const normalized = clamp01(radius / maxAxis);
  const minimum = 0.5 / Math.max(mask.width, mask.height);
  return Math.max(normalized, minimum);
};

const paintStroke = (
  mask: RoomMask,
  points: Point[],
  radius: number,
  mode: 'add' | 'erase',
  segmentation: ToolContext['segmentation'],
) => {
  if (points.length === 0) {
    return;
  }
  const localPoints = points.map((point) => toMaskSpace(mask, point));
  const stroke = useSegmentation(segmentation, 'rasterizeFreehandPath', localPoints, mask.width, mask.height, {
    strokeRadius: computeStrokeRadius(mask, radius),
    closePath: false,
  });
  const target = mask.data;
  for (let i = 0; i < target.length; i += 1) {
    const coverage = stroke[i];
    if (coverage === 0) {
      continue;
    }
    if (mode === 'add') {
      if (coverage > target[i]) {
        target[i] = coverage;
      }
    } else {
      target[i] = Math.round((target[i] * (255 - coverage)) / 255);
    }
  }
};

export class PaintbrushTool implements DefineRoomsTool {
  readonly id = 'paintbrush';

  private active = false;

  private mode: 'add' | 'erase' = 'add';

  private lastPoint: Point | null = null;

  private workingMask: RoomMask | null = null;

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    const initial = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    this.mode = pointer.button === 2 || pointer.buttons === 2 || pointer.altKey || pointer.ctrlKey ? 'erase' : 'add';
    this.active = true;
    this.lastPoint = initial;
    ctx.store.previewMask(null);
    const mask = this.ensureWorkingMask(ctx);
    paintStroke(mask, [initial], this.getBrushRadius(ctx, pointer), this.mode, ctx.segmentation);
    ctx.store.commitMask(mask);
  }

  onPointerMove(ctx: ToolContext, pointer: PointerState) {
    if (!this.active || !this.lastPoint) {
      return;
    }
    const point = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    const mask = this.ensureWorkingMask(ctx);
    paintStroke(mask, [this.lastPoint, point], this.getBrushRadius(ctx, pointer), this.mode, ctx.segmentation);
    this.lastPoint = point;
    ctx.store.commitMask(mask);
  }

  onPointerUp(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const point = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    const mask = this.ensureWorkingMask(ctx);
    if (this.lastPoint) {
      paintStroke(mask, [this.lastPoint, point], this.getBrushRadius(ctx, pointer), this.mode, ctx.segmentation);
      ctx.store.commitMask(mask);
    }
    this.active = false;
    this.lastPoint = null;
    this.workingMask = null;
  }

  onCancel(ctx: ToolContext) {
    this.active = false;
    this.lastPoint = null;
    this.workingMask = null;
    ctx.store.previewMask(null);
  }

  private ensureWorkingMask(ctx: ToolContext): RoomMask {
    if (this.workingMask) {
      return this.workingMask;
    }
    const current = ctx.store.getState().selection.mask;
    this.workingMask = current ? cloneRoomMask(current) : createDefaultMask();
    return this.workingMask;
  }

  private getBrushRadius(ctx: ToolContext, pointer?: PointerState) {
    const base = ctx.store.getState().selection.brushRadius ?? 0.05;
    if (pointer?.pressure !== undefined) {
      return Math.max(base * clamp01(pointer.pressure), 0.001);
    }
    return Math.max(base, 0.001);
  }
}

export const createPaintbrushTool = () => new PaintbrushTool();

