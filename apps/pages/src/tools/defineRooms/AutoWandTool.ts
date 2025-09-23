import type { Point } from '../../state/defineRoomsStore';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

const buildCirclePolygon = (center: Point, radius: number, steps = 24): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: clamp01(center.x + Math.cos(angle) * radius),
      y: clamp01(center.y + Math.sin(angle) * radius),
    });
  }
  return points;
};

export class AutoWandTool implements DefineRoomsTool {
  readonly id = 'autoWand';

  private requestId = 0;

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }
    const seed = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    const request = ++this.requestId;

    if (!ctx.segmentation) {
      const radius = Math.max(0.02, ctx.store.getState().brushRadius * 0.75);
      ctx.store.commitPolygon(buildCirclePolygon(seed, radius));
      return;
    }

    const snapStrength = ctx.store.getState().snapStrength;
    const tolerance = Math.round(24 + snapStrength * 48);
    ctx.store.setBusy('Detecting region…');
    ctx.segmentation
      .smartWand(seed, { tolerance, connectivity: 8, softenEdges: true })
      .then((result) => {
        if (this.requestId !== request) {
          return;
        }
        ctx.store.setBusy(null);
        if (result.polygon.length >= 3) {
          ctx.store.commitPolygon(result.polygon);
        } else {
          const radius = Math.max(0.02, ctx.store.getState().brushRadius * 0.75);
          ctx.store.commitPolygon(buildCirclePolygon(seed, radius));
        }
      })
      .catch(() => {
        if (this.requestId === request) {
          ctx.store.setBusy(null);
        }
      });
  }

  onPointerMove() {}

  onPointerUp() {}

  onCancel(ctx: ToolContext) {
    this.requestId += 1;
    ctx.store.setBusy(null);
  }
}

export const createAutoWandTool = () => new AutoWandTool();

