import type { Bounds, Point } from '../../types/geometry';
import type { RoomMask } from '../../utils/roomMask';
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

const pointsToMask = (ctx: ToolContext, points: Point[]): RoomMask | null => {
  if (points.length < 3) {
    return null;
  }
  const baseBounds = computeBounds(points);
  const rangeX = baseBounds.maxX - baseBounds.minX;
  const rangeY = baseBounds.maxY - baseBounds.minY;
  const padding = Math.max(rangeX, rangeY) * 0.1 + 0.01;
  const bounds = expandBounds(baseBounds, padding);
  const widthRatio = bounds.maxX - bounds.minX || 1;
  const heightRatio = bounds.maxY - bounds.minY || 1;
  const maxDimension = Math.max(widthRatio, heightRatio) || 1;
  const baseResolution = 768;
  const scale = baseResolution / Math.max(maxDimension, 0.02);
  const width = Math.max(32, Math.min(1024, Math.round(Math.max(widthRatio, 0.02) * scale)));
  const height = Math.max(32, Math.min(1024, Math.round(Math.max(heightRatio, 0.02) * scale)));
  const localPoints = points.map((point) => ({
    x: clamp01((point.x - bounds.minX) / widthRatio),
    y: clamp01((point.y - bounds.minY) / heightRatio),
  }));
  const strokeRadius = Math.max(1 / Math.max(width, height), 0.003);
  const boundary = useSegmentation(ctx.segmentation, 'rasterizeFreehandPath', localPoints, width, height, {
    strokeRadius,
    closePath: true,
  });
  const filled = useSegmentation(ctx.segmentation, 'fillMaskInterior', boundary, width, height);
  const featherRadius = Math.max(1, Math.round(Math.max(width, height) * 0.01));
  const feathered = useSegmentation(ctx.segmentation, 'featherMask', filled, width, height, featherRadius);
  return {
    width,
    height,
    bounds,
    data: feathered,
  };
};

export class LassoTool implements DefineRoomsTool {
  readonly id = 'lasso';

  private active = false;

  private points: Point[] = [];

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }
    const start = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    this.active = true;
    this.points = [start];
    ctx.store.previewMask(null);
  }

  onPointerMove(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const current = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    const last = this.points[this.points.length - 1];
    if (!last || distance(last, current) > 0.003) {
      this.points.push(current);
    } else if (this.points.length) {
      this.points[this.points.length - 1] = current;
    }
    const preview = pointsToMask(ctx, this.points);
    if (preview) {
      ctx.store.previewMask(preview);
    }
  }

  onPointerUp(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const endPoint = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    if (this.points.length === 0 || distance(this.points[this.points.length - 1], endPoint) > 0.003) {
      this.points.push(endPoint);
    } else {
      this.points[this.points.length - 1] = endPoint;
    }
    const mask = pointsToMask(ctx, this.points);
    this.active = false;
    this.points = [];
    ctx.store.previewMask(null);
    if (mask) {
      ctx.store.commitMask(mask);
    }
  }

  onCancel(ctx: ToolContext) {
    this.active = false;
    this.points = [];
    ctx.store.previewMask(null);
  }
}

export const createLassoTool = () => new LassoTool();

