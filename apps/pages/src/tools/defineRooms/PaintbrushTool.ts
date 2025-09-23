import type { Point } from '../../state/defineRoomsStore';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const interpolate = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

export class PaintbrushTool implements DefineRoomsTool {
  readonly id = 'paintbrush';

  private active = false;

  private mode: 'add' | 'erase' = 'add';

  private lastPoint: Point | null = null;

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    const initial = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    this.mode = pointer.button === 2 || pointer.buttons === 2 || pointer.altKey || pointer.ctrlKey ? 'erase' : 'add';
    this.active = true;
    this.lastPoint = initial;
    ctx.store.applyBrushSample(initial, this.mode);
  }

  onPointerMove(ctx: ToolContext, pointer: PointerState) {
    if (!this.active || !this.lastPoint) {
      return;
    }
    const point = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    this.strokeSegment(ctx, this.lastPoint, point);
    this.lastPoint = point;
  }

  onPointerUp(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const point = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    if (this.lastPoint) {
      this.strokeSegment(ctx, this.lastPoint, point);
    } else {
      ctx.store.applyBrushSample(point, this.mode);
    }
    this.active = false;
    this.lastPoint = null;
  }

  onCancel(ctx: ToolContext) {
    this.active = false;
    this.lastPoint = null;
    ctx.store.previewPolygon(null);
  }

  private strokeSegment(ctx: ToolContext, from: Point, to: Point) {
    const radius = Math.max(0.0025, ctx.store.getState().brushRadius);
    const dist = distance(from, to);
    if (dist === 0) {
      ctx.store.applyBrushSample(to, this.mode);
      return;
    }
    const step = Math.max(radius * 0.5, 0.003);
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const point = clampPoint(ctx.snap(ctx.clamp(interpolate(from, to, t))));
      ctx.store.applyBrushSample(point, this.mode);
    }
  }
}

export const createPaintbrushTool = () => new PaintbrushTool();

