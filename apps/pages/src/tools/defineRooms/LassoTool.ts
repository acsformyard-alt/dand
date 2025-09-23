import type { Point } from '../../state/defineRoomsStore';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

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
    ctx.store.previewPolygon(this.points.slice());
  }

  onPointerMove(ctx: ToolContext, pointer: PointerState) {
    if (!this.active) {
      return;
    }
    const current = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    const last = this.points[this.points.length - 1];
    if (!last || distance(last, current) > 0.003) {
      this.points.push(current);
      ctx.store.previewPolygon(this.points.slice());
    } else if (this.points.length) {
      this.points[this.points.length - 1] = current;
      ctx.store.previewPolygon(this.points.slice());
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
    this.finish(ctx);
  }

  onCancel(ctx: ToolContext) {
    this.active = false;
    this.points = [];
    ctx.store.previewPolygon(null);
  }

  private finish(ctx: ToolContext) {
    this.active = false;
    const polygon = this.points.slice();
    this.points = [];
    if (polygon.length >= 3) {
      ctx.store.commitPolygon(polygon);
    } else {
      ctx.store.previewPolygon(null);
    }
  }
}

export const createLassoTool = () => new LassoTool();

