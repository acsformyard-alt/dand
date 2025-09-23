import type { Point } from '../../state/defineRoomsStore';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

export class SmartLassoTool implements DefineRoomsTool {
  readonly id = 'smartLasso';

  private active = false;

  private rawPoints: Point[] = [];

  private requestId = 0;

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }
    const start = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    this.active = true;
    this.rawPoints = [start];
    this.requestId += 1;
    ctx.store.previewPolygon([start]);
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
    this.updatePreview(ctx);
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
    this.active = false;
    const request = ++this.requestId;
    const finalize = (path: Point[]) => {
      if (this.requestId !== request) {
        return;
      }
      if (path.length >= 3) {
        ctx.store.commitPolygon(path);
      } else {
        ctx.store.previewPolygon(null);
      }
      ctx.store.setBusy(null);
      this.rawPoints = [];
    };

    if (ctx.segmentation && this.rawPoints.length >= 2) {
      const samples = this.samplePoints(ctx);
      ctx.store.setBusy('Tracing live-wire…');
      this.computeLiveWire(ctx, samples)
        .then((path) => finalize(path))
        .catch(() => finalize(samples));
    } else {
      finalize(this.rawPoints.slice());
    }
  }

  onCancel(ctx: ToolContext) {
    this.requestId += 1;
    this.active = false;
    this.rawPoints = [];
    ctx.store.setBusy(null);
    ctx.store.previewPolygon(null);
  }

  private updatePreview(ctx: ToolContext) {
    ctx.store.previewPolygon(this.rawPoints.slice());
    if (!ctx.segmentation || this.rawPoints.length < 2) {
      return;
    }
    const samples = this.samplePoints(ctx);
    const request = ++this.requestId;
    ctx.store.setBusy('Tracing live-wire…');
    this.computeLiveWire(ctx, samples)
      .then((path) => {
        if (this.requestId !== request) {
          return;
        }
        ctx.store.previewPolygon(path);
        ctx.store.setBusy(null);
      })
      .catch(() => {
        if (this.requestId === request) {
          ctx.store.setBusy(null);
        }
      });
  }

  private samplePoints(ctx: ToolContext) {
    const spacing = Math.max(0.01, ctx.store.getState().brushRadius * 0.75);
    const samples: Point[] = [];
    for (const point of this.rawPoints) {
      if (!samples.length) {
        samples.push(point);
        continue;
      }
      const last = samples[samples.length - 1];
      if (distance(last, point) >= spacing) {
        samples.push(point);
      }
    }
    const lastPoint = this.rawPoints[this.rawPoints.length - 1];
    if (samples.length === 0) {
      samples.push(lastPoint);
    } else if (distance(samples[samples.length - 1], lastPoint) > 0) {
      samples.push(lastPoint);
    }
    return samples;
  }

  private async computeLiveWire(ctx: ToolContext, samples: Point[]): Promise<Point[]> {
    if (!ctx.segmentation) {
      return samples;
    }
    const result: Point[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      const point = samples[i];
      if (i === 0) {
        result.push(point);
        continue;
      }
      try {
        const segment = await ctx.segmentation.liveWire(samples[i - 1], point);
        if (segment.length === 0) {
          result.push(point);
        } else {
          if (result.length) {
            result.pop();
          }
          result.push(...segment);
        }
      } catch (_error) {
        result.push(point);
      }
    }
    return result;
  }
}

export const createSmartLassoTool = () => new SmartLassoTool();

