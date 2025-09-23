import type { DefineRoomsStore, Point } from '../../state/defineRoomsStore';
import type { SegmentationWorker } from '../../workers/seg';

export interface PointerState {
  point: Point;
  button?: number;
  buttons?: number;
  pressure?: number;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface ToolContext {
  store: DefineRoomsStore;
  segmentation: SegmentationWorker | null;
  snap(point: Point): Point;
  clamp(point: Point): Point;
}

export interface DefineRoomsTool {
  readonly id: string;
  onPointerDown(ctx: ToolContext, pointer: PointerState): void;
  onPointerMove(ctx: ToolContext, pointer: PointerState): void;
  onPointerUp(ctx: ToolContext, pointer: PointerState): void;
  onCancel?(ctx: ToolContext): void;
}

