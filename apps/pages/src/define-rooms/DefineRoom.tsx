/** @jsxImportSource ./lib */

const ROOM_COLORS = [
  "#ff6b6b",
  "#4ecdc4",
  "#ffd166",
  "#9b5de5",
  "#48cae4",
  "#f72585",
  "#06d6a0",
  "#f8961e",
  "#577590",
  "#ff7f50",
  "#2ec4b6",
  "#c77dff"
];

type ToolType = "brush" | "eraser" | "lasso" | "magnetic" | "wand" | "magnify" | "move";

type Point = { x: number; y: number };

type Room = {
  id: string;
  name: string;
  description: string;
  tags: string;
  visibleAtStart: boolean;
  isConfirmed: boolean;
  mask: Uint8Array;
  color: string;
  colorVector: [number, number, number];
};

export type DefineRoomData = Room;

type DefineRoomMode = 'overlay' | 'embedded';

interface DefineRoomOptions {
  mode?: DefineRoomMode;
}

const TOOL_LABELS: Record<ToolType, string> = {
  brush: "Paintbrush Select",
  eraser: "Eraser",
  lasso: "Lasso",
  magnetic: "Magnetic Lasso",
  wand: "Magic Wand",
  magnify: "Magnifying Glass",
  move: "Move / Select"
};

const TOOL_ICONS: Record<ToolType, string> = {
  brush: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14.5 4.5l5 5-8.8 8.8a3 3 0 01-1.7.86l-4.5.64.64-4.5a3 3 0 01.86-1.7L14.5 4.5z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M13.5 5.5l5 5"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M10.1 15.9L8.2 16.4 7.7 18.3 9.6 17.8 10.1 15.9z"
        fill="currentColor"
      />
    </svg>
  `,
  eraser: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4.4 14.9l7-7a2 2 0 012.83 0l4.87 4.87a2 2 0 010 2.83l-3.7 3.7H9.1a2 2 0 01-1.41-.59l-3.3-3.3z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M7.5 19.3H20"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M10.7 8.6l4.7 4.7"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  lasso: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.5 9.5c0-3.3 3.5-6 7.5-6s7.5 2.7 7.5 6-3.5 6-7.5 6c-1.2 0-2.3-.2-3.3-.6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M6 13c-1.2.6-2 1.5-2 2.5 0 1.7 2 2.5 4 2.5 1.3 0 2.5-.3 3.3-.9"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M11.5 17l.5 3"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  magnetic: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 14V7a5 5 0 015-5h0a5 5 0 015 5v7a5 5 0 01-5 5h0a5 5 0 01-5-5z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M7 11h4"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M15 11h2"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M17.5 4.5l1.2-1.2"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M18.2 7.7l2-1"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  wand: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 20l9-9"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M16 4l.8 2.2L19 7l-2.2.8L16 10l-.8-2.2L13 7l2.2-.8L16 4z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M19 11.5l.5 1.3L21 13.3l-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  magnify: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle
        cx="11"
        cy="11"
        r="6"
        stroke="currentColor"
        stroke-width="1.6"
      />
      <path
        d="M20 20l-4.5-4.5"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  move: `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3l3 3-3 3-3-3 3-3zM12 15l3 3-3 3-3-3 3-3zM3 12l3-3 3 3-3 3-3-3zM15 12l3-3 3 3-3 3-3-3z"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `
};

const DELETE_ROOM_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5 7h14"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M9 7V4.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M18 7l-.8 11.2a1.6 1.6 0 01-1.6 1.48H8.4A1.6 1.6 0 016.8 18.2L6 7"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M10 11.5v4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    <path d="M14 11.5v4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
  </svg>
`;

const NEW_ROOM_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 5v14"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M5 12h14"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

const CONFIRM_ROOM_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M5 12l4 4 10-10"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

const CANCEL_ROOM_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M18 6L6 18"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M6 6l12 12"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

const TOOL_ORDER: ToolType[] = ["move", "magnify", "brush", "eraser", "lasso", "magnetic", "wand"];

const UNDO_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M9 5L4 10l5 5"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M20 19a8 8 0 00-8-8H4"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

const REDO_ICON = `
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M15 5l5 5-5 5"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M4 19a8 8 0 018-8h8"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
`;

const HISTORY_LIMIT = 30;

function colorToVector(color: string): [number, number, number] {
  const hex = color.replace("#", "");
  const bigint = Number.parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function bresenham(from: Point, to: Point, visit: (point: Point) => void): void {
  let x0 = Math.round(from.x);
  let y0 = Math.round(from.y);
  const x1 = Math.round(to.x);
  const y1 = Math.round(to.y);

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    visit({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function fillPolygon(
  mask: Uint8Array,
  width: number,
  height: number,
  polygon: Point[],
  value: 0 | 1,
  shouldFill?: (index: number) => boolean
): void {
  if (polygon.length < 3) {
    return;
  }

  const points = polygon.map((point) => ({
    x: clamp(Math.round(point.x), 0, width - 1),
    y: clamp(Math.round(point.y), 0, height - 1)
  }));

  let minY = height - 1;
  let maxY = 0;
  points.forEach((point) => {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  });

  for (let y = minY; y <= maxY; y += 1) {
    const intersections: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      if ((current.y <= y && next.y > y) || (next.y <= y && current.y > y)) {
        const ratio = (y - current.y) / (next.y - current.y);
        intersections.push(current.x + ratio * (next.x - current.x));
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length; i += 2) {
      const start = clamp(Math.floor(intersections[i]), 0, width - 1);
      const end = clamp(Math.ceil(intersections[i + 1]), 0, width - 1);
      for (let x = start; x <= end; x += 1) {
        const index = y * width + x;
        if (shouldFill && !shouldFill(index)) {
          continue;
        }
        mask[index] = value;
      }
    }
  }
}

export class DefineRoom {
  private root: HTMLElement;

  private roomsPanel!: HTMLElement;

  private roomsList!: HTMLElement;

  private roomsEmptyState!: HTMLElement;

  private deleteBackdrop!: HTMLElement;

  private deleteCancelButton!: HTMLButtonElement;

  private deleteConfirmButton!: HTMLButtonElement;

  private deleteDialogIcon!: HTMLElement;

  private pendingDeleteRoomId: string | null = null;

  private colorMenu!: HTMLElement;

  private colorMenuOptions: HTMLButtonElement[] = [];

  private colorMenuTrigger: HTMLElement | null = null;

  private activeColorRoomId: string | null = null;

  private toolbarContainer!: HTMLElement;

  private handleColorMenuOutsideClick = (event: MouseEvent): void => {
    if (!this.colorMenu || this.colorMenu.classList.contains("hidden")) {
      return;
    }

    const target = event.target as Node;
    if (this.colorMenu.contains(target)) {
      return;
    }

    if (this.colorMenuTrigger && this.colorMenuTrigger.contains(target)) {
      return;
    }

    this.closeColorMenu();
  };


  private toolbarPrimaryButton!: HTMLButtonElement;

  private toolbarConfirmGroup!: HTMLElement;

  private toolbarConfirmButton!: HTMLButtonElement;

  private toolbarCancelButton!: HTMLButtonElement;

  private undoButton!: HTMLButtonElement;

  private redoButton!: HTMLButtonElement;

  private toolButtons: Map<ToolType, HTMLButtonElement> = new Map();

  private brushSliderContainer!: HTMLElement;

  private brushSliderTrack!: HTMLElement;

  private brushSliderFill!: HTMLElement;

  private brushSliderThumb!: HTMLElement;

  private brushSliderValueLabel!: HTMLElement;

  private brushSliderPointerId: number | null = null;

  private brushSliderCaptureElement: HTMLElement | null = null;

  private imageCanvas!: HTMLCanvasElement;

  private overlayCanvas!: HTMLCanvasElement;

  private selectionCanvas!: HTMLCanvasElement;

  private canvasWrapper!: HTMLElement;

  private hoverLabel!: HTMLElement;

  private closeButton: HTMLButtonElement | null = null;

  private imageContext!: CanvasRenderingContext2D;

  private overlayContext!: CanvasRenderingContext2D;

  private selectionContext!: CanvasRenderingContext2D;

  private rooms: Room[] = [];

  private expandedRoomId: string | null = null;

  private activeRoomId: string | null = null;

  private currentTool: ToolType = "brush";

  private isConfirmingRoom = false;

  private pendingRoomId: string | null = null;

  private previousActiveRoomId: string | null = null;

  private isCreatingRoom = false;

  private editingOriginalMask: Uint8Array | null = null;

  private readonly brushRadiusMin = 1;

  private readonly brushRadiusMax = 40;

  private brushRadius = 12;

  private magicWandTolerance = 38;

  private magneticRadius = 14;

  private imageData: ImageData | null = null;

  private grayscale: Float32Array | null = null;

  private gradient: Float32Array | null = null;

  private gradientMax = 1;

  private drawing = false;

  private pointerId: number | null = null;

  private lastPoint: Point | null = null;

  private lassoPath: Point[] = [];

  private brushPreviewPoint: Point | null = null;

  private magnifyIndex = 0;

  private readonly magnifyScales: number[] = [1, 2, 3];

  private readonly magnifyTransition = "transform 250ms ease";

  private magnifyOrigin = "50% 50%";

  private panOffset: { x: number; y: number } = { x: 0, y: 0 };

  private panStartClient: { x: number; y: number } | null = null;

  private panStartOffset: { x: number; y: number } | null = null;

  private isPanning = false;

  private panPointerId: number | null = null;

  private panHasMoved = false;

  private pendingSelectionPoint: Point | null = null;

  private pendingSelectionPointerId: number | null = null;

  private hoverCandidateRoomId: string | null = null;

  private hoverActiveRoomId: string | null = null;

  private hoverTimeoutId: number | null = null;

  private hoverClientPosition: { x: number; y: number } | null = null;

  private isAdjustingBrushSize = false;

  private width = 0;

  private height = 0;

  private historyStacks: Map<string, { undo: Uint8Array[]; redo: Uint8Array[] }> = new Map();

  private mode: DefineRoomMode;

  constructor(options: DefineRoomOptions = {}) {
    this.mode = options.mode ?? 'overlay';
    this.root = (
      <div
        class={`define-room-overlay hidden${this.mode === 'embedded' ? ' define-room-embedded' : ''}`}
      >
        <div class="define-room-window">
          {this.mode === 'overlay' && (
            <div class="define-room-header">
              <h1>Define Rooms</h1>
              <button class="define-room-close" type="button">Close</button>
            </div>
          )}
          <div class="define-room-body">
            <section class="define-room-editor">
              <div class="toolbar-area">
                <div
                  class="brush-slider-container"
                  ref={(node: HTMLElement | null) => node && (this.brushSliderContainer = node)}
                  aria-hidden="true"
                  aria-label="Brush size"
                >
                  <div class="brush-slider-track" ref={(node: HTMLElement | null) => node && (this.brushSliderTrack = node)}>
                    <div class="brush-slider-fill" ref={(node: HTMLElement | null) => node && (this.brushSliderFill = node)}></div>
                    <div class="brush-slider-thumb" ref={(node: HTMLElement | null) => node && (this.brushSliderThumb = node)}></div>
                  </div>
                  <div
                    class="brush-slider-value"
                    aria-hidden="true"
                    ref={(node: HTMLElement | null) => node && (this.brushSliderValueLabel = node)}
                  ></div>
                </div>
                <div class="toolbar" ref={(node: HTMLElement | null) => node && (this.toolbarContainer = node)}>
                  <div class="toolbar-primary-group">
                    <button class="toolbar-button toolbar-primary" type="button" aria-label="New Room" title="New Room">
                      <span class="toolbar-button-icon" aria-hidden="true"></span>
                      <span class="toolbar-button-label" aria-hidden="true">New Room</span>
                    </button>
                    <div class="toolbar-confirm-group">
                      <button
                        class="toolbar-button toolbar-confirm"
                        type="button"
                        aria-label="Confirm Room"
                        title="Confirm Room"
                      >
                        <span class="toolbar-button-icon" aria-hidden="true"></span>
                        <span class="toolbar-button-label" aria-hidden="true">Confirm</span>
                      </button>
                      <button
                        class="toolbar-button toolbar-cancel"
                        type="button"
                        aria-label="Cancel Room"
                        title="Cancel Room"
                      >
                        <span class="toolbar-button-icon" aria-hidden="true"></span>
                        <span class="toolbar-button-label" aria-hidden="true">Cancel</span>
                      </button>
                    </div>
                  </div>
                  <div class="history-group">
                    <button
                      class="toolbar-button tool-button history-button toolbar-undo"
                      type="button"
                      aria-label="Undo"
                      title="Undo"
                    >
                      <span class="toolbar-button-icon" aria-hidden="true"></span>
                      <span class="toolbar-button-label" aria-hidden="true">Undo</span>
                    </button>
                    <button
                      class="toolbar-button tool-button history-button toolbar-redo"
                      type="button"
                      aria-label="Redo"
                      title="Redo"
                    >
                      <span class="toolbar-button-icon" aria-hidden="true"></span>
                      <span class="toolbar-button-label" aria-hidden="true">Redo</span>
                    </button>
                  </div>
                  <div class="tool-group"></div>
                </div>
              </div>
              <div class="canvas-wrapper">
                <canvas class="image-layer"></canvas>
                <canvas class="mask-layer"></canvas>
                <canvas class="selection-layer"></canvas>
                <div class="room-hover-label" aria-hidden="true"></div>
              </div>
            </section>
            <aside class="define-room-sidebar" ref={(node: HTMLElement | null) => node && (this.roomsPanel = node)}>
              <div class="rooms-header">
                <h2>Rooms</h2>
              </div>
              <p class="rooms-empty" ref={(node: HTMLElement | null) => node && (this.roomsEmptyState = node)}>
                No rooms defined yet.
              </p>
              <div class="rooms-list"></div>
              <div class="room-color-menu hidden" aria-hidden="true"></div>
            </aside>
          </div>
        </div>
        <div class="room-delete-backdrop hidden" aria-hidden="true">
          <div
            class="room-delete-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-delete-title"
            tabindex="-1"
          >
            <div class="room-delete-icon-wrapper">
              <div class="room-delete-icon" aria-hidden="true"></div>
            </div>
            <h2 id="room-delete-title" class="room-delete-title">Are you sure?</h2>
            <p class="room-delete-message">
              Do you really want to continue ? This process cannot be undone
            </p>
            <div class="room-delete-actions">
              <button class="room-delete-cancel" type="button">Cancel</button>
              <button class="room-delete-confirm" type="button">Confirm</button>
            </div>
          </div>
        </div>
      </div>
    ) as HTMLElement;

    this.initializeDomReferences();
    this.attachEventListeners();
  }

  public mount(container: HTMLElement): void {
    container.appendChild(this.root);
  }

  public loadImage(image: HTMLImageElement): void {
    this.prepareImage(image);
  }

  public open(image: HTMLImageElement, options: { resetExisting?: boolean } = {}): void {
    const { resetExisting = true } = options;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const shouldReset =
      resetExisting || !this.imageData || this.width !== width || this.height !== height;
    this.root.classList.remove("hidden");
    if (shouldReset) {
      this.prepareImage(image);
    }
  }

  public show(): void {
    this.root.classList.remove("hidden");
  }

  public close(): void {
    this.root.classList.add("hidden");
    this.stopBrushSliderInteraction();
    this.closeColorMenu();
    this.hideDeleteDialog();
  }

  public getRooms(): DefineRoomData[] {
    return this.rooms.map((room) => ({
      ...room,
      mask: room.mask.slice(),
      colorVector: [...room.colorVector] as [number, number, number],
    }));
  }

  public getImageDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  public destroy(): void {
    this.close();
    document.removeEventListener("click", this.handleColorMenuOutsideClick);
    this.root.remove();
  }

  public get element(): HTMLElement {
    return this.root;
  }

  private initializeDomReferences(): void {
    this.toolbarPrimaryButton = this.root.querySelector(".toolbar-primary") as HTMLButtonElement;
    this.toolbarConfirmGroup = this.root.querySelector(".toolbar-confirm-group") as HTMLElement;
    this.toolbarConfirmButton = this.root.querySelector(".toolbar-confirm") as HTMLButtonElement;
    this.toolbarCancelButton = this.root.querySelector(".toolbar-cancel") as HTMLButtonElement;
    this.undoButton = this.root.querySelector(".toolbar-undo") as HTMLButtonElement;
    this.redoButton = this.root.querySelector(".toolbar-redo") as HTMLButtonElement;
    this.roomsList = this.roomsPanel.querySelector(".rooms-list") as HTMLElement;
    this.colorMenu = this.roomsPanel.querySelector(".room-color-menu") as HTMLElement;
    this.deleteBackdrop = this.root.querySelector(".room-delete-backdrop") as HTMLElement;
    this.deleteCancelButton = this.root.querySelector(".room-delete-cancel") as HTMLButtonElement;
    this.deleteConfirmButton = this.root.querySelector(".room-delete-confirm") as HTMLButtonElement;
    this.deleteDialogIcon = this.root.querySelector(".room-delete-icon") as HTMLElement;
    const toolGroup = this.root.querySelector(".tool-group") as HTMLElement;
    this.canvasWrapper = this.root.querySelector(".canvas-wrapper") as HTMLElement;
    this.imageCanvas = this.root.querySelector(".image-layer") as HTMLCanvasElement;
    this.overlayCanvas = this.root.querySelector(".mask-layer") as HTMLCanvasElement;
    this.selectionCanvas = this.root.querySelector(".selection-layer") as HTMLCanvasElement;
    this.hoverLabel = this.root.querySelector(".room-hover-label") as HTMLElement;
    this.closeButton = this.root.querySelector(".define-room-close") as HTMLButtonElement;

    this.initializeColorMenu();

    this.roomsList.addEventListener("scroll", () => this.closeColorMenu());

    if (this.deleteBackdrop) {
      this.deleteBackdrop.addEventListener("click", (event) => {
        if (event.target === this.deleteBackdrop) {
          this.hideDeleteDialog();
        }
      });
      this.deleteBackdrop.addEventListener("keydown", (event) => {
        if ((event as KeyboardEvent).key === "Escape") {
          event.preventDefault();
          this.hideDeleteDialog();
        }
      });
    }

    if (this.deleteCancelButton) {
      this.deleteCancelButton.addEventListener("click", () => this.hideDeleteDialog());
    }

    if (this.deleteConfirmButton) {
      this.deleteConfirmButton.addEventListener("click", () => this.confirmRoomDeletion());
    }

    if (this.deleteDialogIcon) {
      this.deleteDialogIcon.innerHTML = DELETE_ROOM_ICON;
      const dialogIconSvg = this.deleteDialogIcon.querySelector("svg");
      if (dialogIconSvg) {
        dialogIconSvg.setAttribute("aria-hidden", "true");
        dialogIconSvg.setAttribute("focusable", "false");
      }
    }

    document.addEventListener("click", this.handleColorMenuOutsideClick);

    this.updateBrushSliderUi();

    this.roomsPanel.addEventListener("click", (event) => {
      if (this.isConfirmingRoom) {
        return;
      }
      if (event.target === this.roomsPanel || event.target === this.roomsList) {
        this.selectRoom(null);
      }
    });

    const primaryIcon = this.toolbarPrimaryButton.querySelector(
      ".toolbar-button-icon"
    ) as HTMLElement | null;
    if (primaryIcon) {
      primaryIcon.innerHTML = NEW_ROOM_ICON;
    }

    const confirmIcon = this.toolbarConfirmButton.querySelector(
      ".toolbar-button-icon"
    ) as HTMLElement | null;
    if (confirmIcon) {
      confirmIcon.innerHTML = CONFIRM_ROOM_ICON;
    }

    const cancelIcon = this.toolbarCancelButton.querySelector(
      ".toolbar-button-icon"
    ) as HTMLElement | null;
    if (cancelIcon) {
      cancelIcon.innerHTML = CANCEL_ROOM_ICON;
    }

    const undoIcon = this.undoButton.querySelector(".toolbar-button-icon") as HTMLElement | null;
    if (undoIcon) {
      undoIcon.innerHTML = UNDO_ICON;
    }

    const redoIcon = this.redoButton.querySelector(".toolbar-button-icon") as HTMLElement | null;
    if (redoIcon) {
      redoIcon.innerHTML = REDO_ICON;
    }

    this.imageContext = this.imageCanvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    this.overlayContext = this.overlayCanvas.getContext("2d") as CanvasRenderingContext2D;
    this.selectionContext = this.selectionCanvas.getContext("2d") as CanvasRenderingContext2D;

    this.toolbarPrimaryButton.addEventListener("click", () => this.createRoom());
    this.toolbarConfirmButton.addEventListener("click", () => this.confirmRoomCreation());
    this.toolbarCancelButton.addEventListener("click", () => this.cancelRoomCreation());
    this.undoButton.addEventListener("click", () => this.undoMaskChange());
    this.redoButton.addEventListener("click", () => this.redoMaskChange());

    this.updateNewRoomControls();
    this.updateHistoryControls();

    TOOL_ORDER.forEach((tool) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toolbar-button tool-button";
      button.setAttribute("aria-label", TOOL_LABELS[tool]);
      button.title = TOOL_LABELS[tool];

      const icon = document.createElement("span");
      icon.className = "toolbar-button-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = TOOL_ICONS[tool];
      button.appendChild(icon);

      const label = document.createElement("span");
      label.className = "toolbar-button-label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = TOOL_LABELS[tool];
      button.appendChild(label);

      button.addEventListener("click", () => this.setTool(tool));
      toolGroup.appendChild(button);
      this.toolButtons.set(tool, button);
    });
    this.setTool(this.currentTool);
    this.updateToolAvailability();

    if (this.hoverLabel) {
      this.hoverLabel.setAttribute("aria-hidden", "true");
    }
  }

  private attachEventListeners(): void {
    if (this.closeButton) {
      this.closeButton.addEventListener("click", () => this.close());
    }
    this.root.addEventListener("click", (event) => {
      if (event.target === this.root) {
        this.close();
      }
    });

    this.overlayCanvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.overlayCanvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.overlayCanvas.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.overlayCanvas.addEventListener("pointerleave", (event) => this.handlePointerUp(event));
    this.overlayCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
    this.overlayCanvas.style.touchAction = "none";

    this.attachBrushSliderEvents();
  }

  private initializeColorMenu(): void {
    if (!this.colorMenu) {
      return;
    }

    this.colorMenu.innerHTML = "";
    this.colorMenuOptions = [];

    const grid = document.createElement("div");
    grid.className = "room-color-grid";

    ROOM_COLORS.forEach((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "room-color-option";
      button.dataset.color = color;
      button.style.backgroundColor = color;
      button.addEventListener("click", () => this.handleColorSelection(color));
      grid.appendChild(button);
      this.colorMenuOptions.push(button);
    });

    this.colorMenu.appendChild(grid);
  }

  private openColorMenu(roomId: string, trigger: HTMLElement): void {
    if (!this.colorMenu) {
      return;
    }

    const room = this.rooms.find((entry) => entry.id === roomId);
    if (!room) {
      return;
    }

    this.activeColorRoomId = roomId;
    this.colorMenuTrigger = trigger;
    this.colorMenu.classList.remove("hidden");
    this.colorMenu.setAttribute("aria-hidden", "false");

    this.colorMenuOptions.forEach((button) => {
      button.classList.toggle("selected", button.dataset.color === room.color);
    });

    requestAnimationFrame(() => this.positionColorMenu(trigger));
  }

  private positionColorMenu(trigger: HTMLElement): void {
    if (!this.colorMenu || !this.roomsPanel) {
      return;
    }

    const sidebarRect = this.roomsPanel.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = this.colorMenu.getBoundingClientRect();

    let top = triggerRect.top - sidebarRect.top + triggerRect.height / 2 - menuRect.height / 2;
    const maxTop = this.roomsPanel.clientHeight - menuRect.height - 16;
    top = Math.max(16, Math.min(top, maxTop));

    let left = triggerRect.left - sidebarRect.left - menuRect.width - 12;
    if (left < 12) {
      left = 12;
    }

    this.colorMenu.style.top = `${top}px`;
    this.colorMenu.style.left = `${left}px`;
  }

  private closeColorMenu(): void {
    if (!this.colorMenu || this.colorMenu.classList.contains("hidden")) {
      return;
    }
    this.colorMenu.classList.add("hidden");
    this.colorMenu.setAttribute("aria-hidden", "true");
    this.colorMenuTrigger = null;
    this.activeColorRoomId = null;
  }

  private handleColorSelection(color: string): void {
    const roomId = this.activeColorRoomId;
    if (!roomId) {
      this.closeColorMenu();
      return;
    }

    const room = this.rooms.find((entry) => entry.id === roomId);
    if (!room) {
      this.closeColorMenu();
      return;
    }

    if (room.color !== color) {
      room.color = color;
      room.colorVector = colorToVector(color);
    }

    this.closeColorMenu();
    this.renderOverlay();
    this.updateRoomList();
  }

  private requestRoomDeletion(roomId: string): void {
    if (!this.deleteBackdrop) {
      return;
    }

    const room = this.rooms.find((entry) => entry.id === roomId);
    if (!room) {
      return;
    }

    this.closeColorMenu();
    this.pendingDeleteRoomId = roomId;
    this.deleteBackdrop.classList.remove("hidden");
    this.deleteBackdrop.setAttribute("aria-hidden", "false");

    queueMicrotask(() => {
      this.deleteConfirmButton?.focus?.();
    });
  }

  private hideDeleteDialog(): void {
    if (!this.deleteBackdrop) {
      return;
    }

    this.deleteBackdrop.classList.add("hidden");
    this.deleteBackdrop.setAttribute("aria-hidden", "true");
    this.pendingDeleteRoomId = null;
  }

  private confirmRoomDeletion(): void {
    if (!this.pendingDeleteRoomId) {
      this.hideDeleteDialog();
      return;
    }

    const roomId = this.pendingDeleteRoomId;
    this.rooms = this.rooms.filter((room) => room.id !== roomId);
    this.historyStacks.delete(roomId);

    if (this.activeRoomId === roomId) {
      this.activeRoomId = null;
    }

    if (this.expandedRoomId === roomId) {
      this.expandedRoomId = null;
    }

    if (this.pendingRoomId === roomId) {
      this.isConfirmingRoom = false;
      this.pendingRoomId = null;
      this.isCreatingRoom = false;
      this.editingOriginalMask = null;
    }

    if (this.previousActiveRoomId === roomId) {
      this.previousActiveRoomId = null;
    }

    if (this.hoverCandidateRoomId === roomId) {
      this.hoverCandidateRoomId = null;
    }

    if (this.hoverActiveRoomId === roomId) {
      this.hoverActiveRoomId = null;
    }

    this.pendingDeleteRoomId = null;
    this.hideDeleteDialog();
    this.closeColorMenu();

    this.renderOverlay();
    this.updateRoomList();
    this.updateNewRoomControls();
    this.updateToolAvailability();
    this.updateHistoryControls();
  }

  private attachBrushSliderEvents(): void {
    if (!this.brushSliderTrack || !this.brushSliderThumb || !this.brushSliderContainer) {
      return;
    }

    const pointerDownHandler = (event: PointerEvent) => {
      if (!this.brushSliderContainer.classList.contains("visible")) {
        return;
      }
      this.startBrushSliderInteraction(event);
    };

    this.brushSliderTrack.addEventListener("pointerdown", pointerDownHandler);
    this.brushSliderThumb.addEventListener("pointerdown", pointerDownHandler);
  }

  private startBrushSliderInteraction(event: PointerEvent): void {
    if (!this.brushSliderTrack || !this.brushSliderContainer) {
      return;
    }

    if (this.isAdjustingBrushSize && this.brushSliderPointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.isAdjustingBrushSize = true;
    this.brushSliderPointerId = event.pointerId;
    this.brushSliderCaptureElement = event.currentTarget as HTMLElement | null;
    try {
      this.brushSliderCaptureElement?.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore pointer capture errors in unsupported browsers.
    }

    this.brushSliderContainer.classList.add("dragging");

    document.addEventListener("pointermove", this.onBrushSliderPointerMove);
    document.addEventListener("pointerup", this.onBrushSliderPointerUp);
    document.addEventListener("pointercancel", this.onBrushSliderPointerUp);

    this.updateBrushRadiusFromPointer(event);
    this.renderSelectionOverlay();
  }

  private onBrushSliderPointerMove = (event: PointerEvent): void => {
    if (this.brushSliderPointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    this.updateBrushRadiusFromPointer(event);
  };

  private onBrushSliderPointerUp = (event: PointerEvent): void => {
    if (this.brushSliderPointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    this.updateBrushRadiusFromPointer(event);
    this.stopBrushSliderInteraction();
  };

  private stopBrushSliderInteraction(): void {
    if (!this.isAdjustingBrushSize) {
      return;
    }

    if (this.brushSliderPointerId !== null && this.brushSliderCaptureElement) {
      try {
        this.brushSliderCaptureElement.releasePointerCapture?.(this.brushSliderPointerId);
      } catch (error) {
        // Ignore pointer capture errors in unsupported browsers.
      }
    }

    this.brushSliderPointerId = null;
    this.brushSliderCaptureElement = null;
    this.isAdjustingBrushSize = false;

    if (this.brushSliderContainer) {
      this.brushSliderContainer.classList.remove("dragging");
    }

    document.removeEventListener("pointermove", this.onBrushSliderPointerMove);
    document.removeEventListener("pointerup", this.onBrushSliderPointerUp);
    document.removeEventListener("pointercancel", this.onBrushSliderPointerUp);

    this.renderSelectionOverlay();
  }

  private updateBrushRadiusFromPointer(event: PointerEvent): void {
    if (!this.brushSliderTrack) {
      return;
    }

    const rect = this.brushSliderTrack.getBoundingClientRect();
    if (rect.height === 0) {
      return;
    }

    const relativeY = clamp(event.clientY - rect.top, 0, rect.height);
    const percent = 1 - relativeY / rect.height;
    const value = this.brushRadiusMin + percent * (this.brushRadiusMax - this.brushRadiusMin);
    this.setBrushRadius(value);
  }

  private setBrushRadius(value: number): void {
    const rounded = Math.round(value);
    const clamped = clamp(rounded, this.brushRadiusMin, this.brushRadiusMax);
    if (this.brushRadius !== clamped) {
      this.brushRadius = clamped;
    }
    this.updateBrushSliderUi();
    if (this.isAdjustingBrushSize || this.brushPreviewPoint) {
      this.renderSelectionOverlay();
    }
  }

  private updateBrushSliderUi(): void {
    if (!this.brushSliderContainer || !this.brushSliderThumb || !this.brushSliderFill) {
      return;
    }

    const range = this.brushRadiusMax - this.brushRadiusMin;
    const percent = range === 0 ? 0 : (this.brushRadius - this.brushRadiusMin) / range;
    const clampedPercent = clamp(percent, 0, 1);

    this.brushSliderThumb.style.top = `${100 - clampedPercent * 100}%`;
    this.brushSliderFill.style.height = `${clampedPercent * 100}%`;

    if (this.brushSliderValueLabel) {
      this.brushSliderValueLabel.textContent = `${this.brushRadius}`;
    }

    this.brushSliderContainer.setAttribute("aria-valuemin", `${this.brushRadiusMin}`);
    this.brushSliderContainer.setAttribute("aria-valuemax", `${this.brushRadiusMax}`);
    this.brushSliderContainer.setAttribute("aria-valuenow", `${this.brushRadius}`);
    this.brushSliderContainer.setAttribute("aria-orientation", "vertical");
  }

  private updateBrushSliderVisibility(): void {
    if (!this.brushSliderContainer) {
      return;
    }

    const isBrushTool = this.currentTool === "brush" || this.currentTool === "eraser";
    this.brushSliderContainer.classList.toggle("visible", isBrushTool);
    this.brushSliderContainer.setAttribute("aria-hidden", isBrushTool ? "false" : "true");

    if (!isBrushTool && this.isAdjustingBrushSize) {
      this.stopBrushSliderInteraction();
    }
  }

  private prepareImage(image: HTMLImageElement): void {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    this.width = width;
    this.height = height;

    this.imageCanvas.width = width;
    this.imageCanvas.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.selectionCanvas.width = width;
    this.selectionCanvas.height = height;

    this.imageCanvas.style.width = "100%";
    this.overlayCanvas.style.width = "100%";
    this.selectionCanvas.style.width = "100%";

    this.imageCanvas.style.height = "auto";
    this.overlayCanvas.style.height = "auto";
    this.selectionCanvas.style.height = "auto";

    this.resetMagnifyTransform(true);

    this.imageContext.clearRect(0, 0, width, height);
    this.imageContext.drawImage(image, 0, 0, width, height);
    this.imageData = this.imageContext.getImageData(0, 0, width, height);
    this.generateGrayscaleMaps();

    this.rooms = [];
    this.activeRoomId = null;
    this.expandedRoomId = null;
    this.historyStacks.clear();
    this.updateRoomList();
    this.clearMaskLayer();
    this.renderOverlay();

    this.isConfirmingRoom = false;
    this.pendingRoomId = null;
    this.previousActiveRoomId = null;
    this.isCreatingRoom = false;
    this.editingOriginalMask = null;
    this.updateNewRoomControls();
    this.updateHistoryControls();
  }

  private generateGrayscaleMaps(): void {
    if (!this.imageData) {
      return;
    }
    const { width, height, data } = this.imageData;
    this.grayscale = new Float32Array(width * height);
    this.gradient = new Float32Array(width * height);

    for (let i = 0; i < width * height; i += 1) {
      const index = i * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      this.grayscale[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    const gradient = this.gradient;
    if (!gradient) {
      return;
    }
    const grayscale = this.grayscale;
    if (!grayscale) {
      return;
    }

    let maxGradient = 1;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        const gx =
          -grayscale[idx - width - 1] - 2 * grayscale[idx - 1] - grayscale[idx + width - 1] +
          grayscale[idx - width + 1] + 2 * grayscale[idx + 1] + grayscale[idx + width + 1];
        const gy =
          -grayscale[idx - width - 1] - 2 * grayscale[idx - width] - grayscale[idx - width + 1] +
          grayscale[idx + width - 1] + 2 * grayscale[idx + width] + grayscale[idx + width + 1];
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        gradient[idx] = magnitude;
        maxGradient = Math.max(maxGradient, magnitude);
      }
    }
    this.gradientMax = maxGradient;
  }

  private clearMaskLayer(): void {
    this.overlayContext.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.lassoPath = [];
    this.brushPreviewPoint = null;
    this.renderSelectionOverlay();
  }

  private createRoom(): void {
    if (!this.imageData || this.isConfirmingRoom) {
      return;
    }
    const color = ROOM_COLORS[this.rooms.length % ROOM_COLORS.length];
    const newRoom: Room = {
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Room ${this.rooms.length + 1}`,
      description: "",
      tags: "",
      visibleAtStart: false,
      isConfirmed: false,
      mask: new Uint8Array(this.imageData.width * this.imageData.height),
      color,
      colorVector: colorToVector(color)
    };
    this.previousActiveRoomId = this.activeRoomId;
    this.rooms.push(newRoom);
    this.initializeRoomHistory(newRoom.id);
    this.startEditingRoom(newRoom, true);
    this.renderOverlay();
  }

  private startEditingRoom(room: Room, isCreating: boolean): void {
    this.activeRoomId = room.id;
    this.expandedRoomId = room.id;
    this.pendingRoomId = room.id;
    this.isConfirmingRoom = true;
    this.isCreatingRoom = isCreating;
    this.editingOriginalMask = isCreating ? null : room.mask.slice();
    this.getRoomHistory(room.id);
    this.updateRoomList();
    this.updateNewRoomControls();
    this.updateHistoryControls();
    this.updateToolAvailability();
  }

  private editRoom(room: Room): void {
    if (this.isConfirmingRoom) {
      return;
    }
    this.previousActiveRoomId = this.activeRoomId;
    this.startEditingRoom(room, false);
  }

  private confirmRoomCreation(): void {
    if (!this.isConfirmingRoom || !this.pendingRoomId) {
      return;
    }
    const pendingId = this.pendingRoomId;
    const room = this.rooms.find((entry) => entry.id === this.pendingRoomId);
    if (room) {
      room.isConfirmed = true;
    }
    const shouldKeepExpanded = !this.isCreatingRoom;
    this.isConfirmingRoom = false;
    this.pendingRoomId = null;
    this.previousActiveRoomId = null;
    this.activeRoomId = null;
    this.isCreatingRoom = false;
    this.editingOriginalMask = null;
    this.expandedRoomId = shouldKeepExpanded ? pendingId : null;
    this.renderOverlay();
    this.updateRoomList();
    this.updateNewRoomControls();
    this.updateToolAvailability();
    this.updateHistoryControls();
  }

  private cancelRoomCreation(): void {
    if (!this.isConfirmingRoom || !this.pendingRoomId) {
      return;
    }

    const pendingId = this.pendingRoomId;
    const wasCreating = this.isCreatingRoom;
    if (wasCreating) {
      this.rooms = this.rooms.filter((room) => room.id !== pendingId);
      this.historyStacks.delete(pendingId);
    } else {
      const room = this.rooms.find((entry) => entry.id === pendingId);
      if (room && this.editingOriginalMask) {
        room.mask.set(this.editingOriginalMask);
      }
    }

    let nextExpanded: string | null = null;
    if (!wasCreating && this.rooms.some((room) => room.id === pendingId)) {
      nextExpanded = pendingId;
    } else if (
      this.previousActiveRoomId &&
      this.rooms.some((room) => room.id === this.previousActiveRoomId)
    ) {
      nextExpanded = this.previousActiveRoomId;
    }

    this.isConfirmingRoom = false;
    this.pendingRoomId = null;
    this.previousActiveRoomId = null;
    this.activeRoomId = null;
    this.isCreatingRoom = false;
    this.editingOriginalMask = null;
    this.expandedRoomId = nextExpanded;

    this.renderOverlay();
    this.updateRoomList();
    this.updateNewRoomControls();
    this.updateToolAvailability();
    this.updateHistoryControls();
  }

  private updateNewRoomControls(): void {
    const hasImage = Boolean(this.imageData);
    const canCreate = hasImage && !this.isConfirmingRoom;

    this.toolbarPrimaryButton.disabled = !canCreate;
    this.toolbarConfirmButton.disabled = !this.isConfirmingRoom;
    this.toolbarCancelButton.disabled = !this.isConfirmingRoom;

    this.toolbarContainer.classList.toggle("confirming", this.isConfirmingRoom);
    this.toolbarConfirmGroup.setAttribute("aria-hidden", this.isConfirmingRoom ? "false" : "true");
    this.toolbarPrimaryButton.setAttribute("aria-hidden", this.isConfirmingRoom ? "true" : "false");
  }

  private initializeRoomHistory(roomId: string): void {
    this.historyStacks.set(roomId, { undo: [], redo: [] });
    this.updateHistoryControls();
  }

  private getRoomHistory(roomId: string): { undo: Uint8Array[]; redo: Uint8Array[] } {
    let history = this.historyStacks.get(roomId);
    if (!history) {
      history = { undo: [], redo: [] };
      this.historyStacks.set(roomId, history);
    }
    return history;
  }

  private updateHistoryControls(): void {
    const room = this.getActiveRoom();
    if (!room) {
      this.undoButton.disabled = true;
      this.redoButton.disabled = true;
      return;
    }

    const history = this.getRoomHistory(room.id);
    this.undoButton.disabled = history.undo.length === 0;
    this.redoButton.disabled = history.redo.length === 0;
  }

  private updateToolAvailability(): void {
    const isEditing = this.isConfirmingRoom && Boolean(this.pendingRoomId);
    if (!isEditing && this.currentTool !== "move" && this.currentTool !== "magnify") {
      this.setTool("move");
    }
    this.toolButtons.forEach((button, tool) => {
      const allowTool = isEditing || tool === "move" || tool === "magnify";
      button.disabled = !allowTool;
      button.classList.toggle("disabled", !allowTool);
    });
    const allowPointer = isEditing || this.currentTool === "move" || this.currentTool === "magnify";
    this.overlayCanvas.style.pointerEvents = allowPointer ? "auto" : "none";
  }

  private captureUndoState(): void {
    const room = this.getActiveRoom();
    if (!room) {
      return;
    }

    const history = this.getRoomHistory(room.id);
    history.undo.push(room.mask.slice());
    if (history.undo.length > HISTORY_LIMIT) {
      history.undo.splice(0, history.undo.length - HISTORY_LIMIT);
    }
    history.redo.length = 0;
    this.updateHistoryControls();
  }

  private undoMaskChange(): void {
    const room = this.getActiveRoom();
    if (!room) {
      return;
    }

    const history = this.getRoomHistory(room.id);
    if (history.undo.length === 0) {
      return;
    }

    const previous = history.undo.pop() as Uint8Array;
    history.redo.push(room.mask.slice());
    if (history.redo.length > HISTORY_LIMIT) {
      history.redo.splice(0, history.redo.length - HISTORY_LIMIT);
    }
    room.mask.set(previous);
    this.renderOverlay();
    this.updateHistoryControls();
  }

  private redoMaskChange(): void {
    const room = this.getActiveRoom();
    if (!room) {
      return;
    }

    const history = this.getRoomHistory(room.id);
    if (history.redo.length === 0) {
      return;
    }

    const next = history.redo.pop() as Uint8Array;
    history.undo.push(room.mask.slice());
    if (history.undo.length > HISTORY_LIMIT) {
      history.undo.splice(0, history.undo.length - HISTORY_LIMIT);
    }
    room.mask.set(next);
    this.renderOverlay();
    this.updateHistoryControls();
  }

  private selectRoom(id: string | null, options: { focusName?: boolean } = {}): void {
    if (this.isConfirmingRoom && id && this.pendingRoomId && id !== this.pendingRoomId) {
      return;
    }
    if (this.expandedRoomId === id) {
      if (options.focusName && id) {
        queueMicrotask(() => {
          const input = this.roomsList?.querySelector(
            `.room-card[data-room-id="${id}"] .room-name`
          ) as HTMLInputElement | null;
          input?.focus();
        });
      }
      return;
    }
    this.expandedRoomId = id;
    this.updateRoomList();
    if (options.focusName && id) {
      queueMicrotask(() => {
        const input = this.roomsList?.querySelector(
          `.room-card[data-room-id="${id}"] .room-name`
        ) as HTMLInputElement | null;
        input?.focus();
      });
    }
  }

  private getActiveRoom(): Room | null {
    if (!this.activeRoomId) {
      return null;
    }
    return this.rooms.find((room) => room.id === this.activeRoomId) ?? null;
  }

  private updateRoomList(): void {
    if (!this.roomsList) {
      return;
    }
    this.closeColorMenu();
    this.roomsList.innerHTML = "";

    if (this.rooms.length === 0) {
      this.roomsEmptyState.style.display = "block";
      return;
    }
    this.roomsEmptyState.style.display = "none";

    this.rooms.forEach((room) => {
      const isExpanded = this.expandedRoomId === room.id;
      const isEditingRoom = this.isConfirmingRoom && this.pendingRoomId === room.id;
      const card = (
        <div
          class={`room-card ${isExpanded ? "expanded" : ""} ${isEditingRoom ? "editing" : ""}`}
          data-room-id={room.id}
        >
          <div class={`room-row ${isExpanded ? "active" : ""}`} data-room-id={room.id}>
            <span class="room-color" style={{ backgroundColor: room.color }}></span>
            <input class="room-name" type="text" value={room.name} />
            <button class="room-delete-button" type="button" aria-label="Delete room"></button>
          </div>
          <div class="room-card-body">
            <label class="room-field">
              <span class="room-field-label">Description</span>
              <textarea class="room-description" rows={3}>{room.description}</textarea>
            </label>
            <label class="room-field">
              <span class="room-field-label">Tags</span>
              <input class="room-tags" type="text" value={room.tags} />
            </label>
            <label class="room-visible">
              <input class="room-visible-checkbox" type="checkbox" checked={room.visibleAtStart} />
              <span>Visible at start of game</span>
            </label>
            {room.isConfirmed && isExpanded && !isEditingRoom ? (
              <div class="room-card-footer">
                <button class="room-edit-button" type="button">Edit Boundary</button>
                <button class="room-save-button" type="button">Save Details</button>
              </div>
            ) : null}
          </div>
        </div>
      ) as HTMLElement;

      const header = card.querySelector(".room-row") as HTMLElement;
      header.addEventListener("click", () => this.selectRoom(room.id));

      const nameInput = card.querySelector(".room-name") as HTMLInputElement;
      nameInput.addEventListener("input", (event) => {
        room.name = (event.target as HTMLInputElement).value;
      });
      nameInput.addEventListener("focus", () => this.selectRoom(room.id, { focusName: true }));

      const colorSwatch = card.querySelector(".room-color") as HTMLElement;
      colorSwatch.addEventListener("click", (event) => {
        event.stopPropagation();
        this.openColorMenu(room.id, colorSwatch);
      });

      const deleteButton = card.querySelector(".room-delete-button") as HTMLButtonElement | null;
      if (deleteButton) {
        deleteButton.innerHTML = DELETE_ROOM_ICON;
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.requestRoomDeletion(room.id);
        });
      }

      const descriptionField = card.querySelector(".room-description") as HTMLTextAreaElement;
      descriptionField.addEventListener("input", (event) => {
        room.description = (event.target as HTMLTextAreaElement).value;
      });

      const tagsInput = card.querySelector(".room-tags") as HTMLInputElement;
      tagsInput.addEventListener("input", (event) => {
        room.tags = (event.target as HTMLInputElement).value;
      });

      const visibleCheckbox = card.querySelector(".room-visible-checkbox") as HTMLInputElement;
      visibleCheckbox.addEventListener("change", (event) => {
        room.visibleAtStart = (event.target as HTMLInputElement).checked;
      });

      if (room.isConfirmed && isExpanded && !isEditingRoom) {
        const editButton = card.querySelector(".room-edit-button") as HTMLButtonElement;
        editButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.editRoom(room);
        });

        const saveButton = card.querySelector(".room-save-button") as HTMLButtonElement;
        saveButton.addEventListener("click", (event) => {
          event.stopPropagation();
          this.selectRoom(null);
        });
      }

      this.roomsList.appendChild(card);
    });
  }

  private setTool(tool: ToolType): void {
    this.currentTool = tool;
    this.toolButtons.forEach((button, key) => {
      if (key === tool) {
        button.classList.add("active");
      } else {
        button.classList.remove("active");
      }
    });
    this.updateCanvasCursor();
    this.updateBrushSliderVisibility();

    if (tool !== "brush" && tool !== "eraser") {
      this.clearBrushPreview();
    }
    this.renderSelectionOverlay();

    if (tool !== "move") {
      this.resetHoverIntent();
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    event.preventDefault();
    if (event.button === 1 || event.button === 2) {
      return;
    }

    if (this.currentTool === "move") {
      this.resetHoverIntent();
      const isEditing = this.isConfirmingRoom && Boolean(this.pendingRoomId);
      if (!isEditing) {
        const point = this.translatePoint(event);
        if (point) {
          this.pendingSelectionPoint = point;
          this.pendingSelectionPointerId = event.pointerId;
        } else {
          this.pendingSelectionPoint = null;
          this.pendingSelectionPointerId = null;
        }
      } else {
        this.pendingSelectionPoint = null;
        this.pendingSelectionPointerId = null;
      }

      if (this.magnifyIndex === 0) {
        return;
      }

      this.overlayCanvas.setPointerCapture(event.pointerId);
      this.isPanning = true;
      this.panPointerId = event.pointerId;
      this.panStartClient = { x: event.clientX, y: event.clientY };
      this.panStartOffset = { ...this.panOffset };
      this.panHasMoved = false;
      this.updateCanvasCursor();
      return;
    }

    const point = this.translatePoint(event);
    if (!point) {
      return;
    }

    if (this.currentTool === "magnify") {
      this.applyMagnify(point);
      return;
    }

    if (!this.getActiveRoom()) {
      return;
    }

    this.overlayCanvas.setPointerCapture(event.pointerId);
    this.drawing = true;
    this.pointerId = event.pointerId;
    this.lastPoint = point;

    if (this.currentTool === "brush") {
      this.updateBrushPreview(point);
      this.captureUndoState();
      this.applyBrush(point, point, 1);
      this.renderOverlay();
    } else if (this.currentTool === "eraser") {
      this.updateBrushPreview(point);
      this.captureUndoState();
      this.applyBrush(point, point, 0);
      this.renderOverlay();
    } else if (this.currentTool === "lasso") {
      this.lassoPath = [point];
      this.renderSelectionOverlay();
    } else if (this.currentTool === "magnetic") {
      const snapped = this.snapToEdge(point);
      this.lassoPath = [snapped];
      this.renderSelectionOverlay();
    } else if (this.currentTool === "wand") {
      this.captureUndoState();
      this.applyMagicWand(point);
      this.drawing = false;
      this.overlayCanvas.releasePointerCapture(event.pointerId);
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.currentTool === "move") {
      if (this.isPanning && this.panPointerId !== null && event.pointerId === this.panPointerId) {
        event.preventDefault();
        if (!this.panStartClient || !this.panStartOffset) {
          return;
        }
        const deltaX = event.clientX - this.panStartClient.x;
        const deltaY = event.clientY - this.panStartClient.y;
        if (!this.panHasMoved && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
          this.panHasMoved = true;
          this.pendingSelectionPoint = null;
          this.pendingSelectionPointerId = null;
        }
        this.panOffset = { x: this.panStartOffset.x + deltaX, y: this.panStartOffset.y + deltaY };
        this.updateCanvasTransform(this.magnifyScales[this.magnifyIndex], this.magnifyOrigin, false);
        return;
      }

      if (!this.isPanning) {
        this.updateMoveToolHover(event);
      }
      return;
    }

    const isBrushTool = this.currentTool === "brush" || this.currentTool === "eraser";
    const point = this.translatePoint(event);

    if (isBrushTool) {
      if (point) {
        this.updateBrushPreview(point);
      } else {
        this.clearBrushPreview();
      }
    } else if (this.brushPreviewPoint) {
      this.clearBrushPreview();
    }

    if (!this.drawing) {
      return;
    }
    event.preventDefault();
    if (!point) {
      return;
    }

    if (this.currentTool === "brush") {
      if (this.lastPoint) {
        this.applyBrush(this.lastPoint, point, 1);
        this.renderOverlay();
      }
      this.lastPoint = point;
    } else if (this.currentTool === "eraser") {
      if (this.lastPoint) {
        this.applyBrush(this.lastPoint, point, 0);
        this.renderOverlay();
      }
      this.lastPoint = point;
    } else if (this.currentTool === "lasso") {
      if (this.lastPoint && distance(this.lastPoint, point) >= 1) {
        this.lassoPath.push(point);
        this.lastPoint = point;
        this.renderSelectionOverlay();
      }
    } else if (this.currentTool === "magnetic") {
      if (this.lastPoint && distance(this.lastPoint, point) >= 4) {
        const snapped = this.snapToEdge(point);
        this.lassoPath.push(snapped);
        this.lastPoint = snapped;
        this.renderSelectionOverlay();
      }
    }
  }

  private handlePointerUp(event: PointerEvent): void {
    const isBrushTool = this.currentTool === "brush" || this.currentTool === "eraser";
    if (isBrushTool) {
      if (event.type === "pointerleave") {
        this.clearBrushPreview();
      } else {
        const point = this.translatePoint(event);
        if (point) {
          this.updateBrushPreview(point);
        }
      }
    }

    if (this.currentTool === "move") {
      let shouldSelect = false;

      if (this.panPointerId !== null && event.pointerId === this.panPointerId) {
        event.preventDefault();
        const moved = this.panHasMoved;
        this.isPanning = false;
        this.panStartClient = null;
        this.panStartOffset = null;
        try {
          this.overlayCanvas.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore errors when pointer capture is already released.
        }
        this.panPointerId = null;
        this.panHasMoved = false;
        this.updateCanvasCursor();
        shouldSelect = !moved && !this.isConfirmingRoom;
      } else if (
        !this.isConfirmingRoom &&
        this.pendingSelectionPointerId !== null &&
        event.pointerId === this.pendingSelectionPointerId
      ) {
        event.preventDefault();
        shouldSelect = true;
      }

      if (shouldSelect) {
        const point = this.translatePoint(event) ?? this.pendingSelectionPoint;
        this.selectRoomFromPoint(point ?? null);
        this.updateMoveToolHover(event);
      } else {
        this.resetHoverIntent();
      }

      if (this.pendingSelectionPointerId === event.pointerId) {
        this.pendingSelectionPointerId = null;
        this.pendingSelectionPoint = null;
      }

      return;
    }

    if (!this.drawing || (this.pointerId !== null && event.pointerId !== this.pointerId)) {
      return;
    }
    event.preventDefault();

    if (this.currentTool === "lasso" || this.currentTool === "magnetic") {
      if (this.lassoPath.length > 2) {
        this.captureUndoState();
        this.applyPolygon(this.lassoPath);
      }
      this.lassoPath = [];
      this.renderSelectionOverlay();
    }

    try {
      this.overlayCanvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Ignore capture release errors when pointer is already released.
    }

    this.drawing = false;
    this.pointerId = null;
    this.lastPoint = null;
  }

  private getRoomAtPoint(point: Point): Room | null {
    if (!this.imageData) {
      return null;
    }

    const width = this.imageData.width;
    const x = clamp(Math.round(point.x), 0, width - 1);
    const y = clamp(Math.round(point.y), 0, this.imageData.height - 1);
    const index = y * width + x;
    return this.rooms.find((room) => room.mask[index]) ?? null;
  }

  private selectRoomFromPoint(point: Point | null): void {
    if (this.isConfirmingRoom) {
      return;
    }

    if (!point) {
      this.selectRoom(null);
      return;
    }

    const matchedRoom = this.getRoomAtPoint(point);
    this.selectRoom(matchedRoom ? matchedRoom.id : null);
  }

  private clearHoverTimer(): void {
    if (this.hoverTimeoutId !== null) {
      window.clearTimeout(this.hoverTimeoutId);
      this.hoverTimeoutId = null;
    }
  }

  private hideHoverLabel(): void {
    if (!this.hoverLabel) {
      return;
    }
    this.hoverLabel.classList.remove("visible");
    this.hoverLabel.setAttribute("aria-hidden", "true");
    this.hoverActiveRoomId = null;
  }

  private updateHoverLabelPosition(): void {
    if (!this.hoverLabel || !this.canvasWrapper || !this.hoverClientPosition) {
      return;
    }
    const wrapperRect = this.canvasWrapper.getBoundingClientRect();
    const x = clamp(this.hoverClientPosition.x - wrapperRect.left, 8, wrapperRect.width - 8);
    const y = clamp(this.hoverClientPosition.y - wrapperRect.top, 8, wrapperRect.height - 8);
    this.hoverLabel.style.left = `${x}px`;
    this.hoverLabel.style.top = `${y}px`;
  }

  private showHoverLabel(room: Room): void {
    if (!this.hoverLabel) {
      return;
    }
    this.hoverLabel.textContent = room.name || "Untitled Room";
    this.updateHoverLabelPosition();
    this.hoverLabel.classList.add("visible");
    this.hoverLabel.setAttribute("aria-hidden", "false");
    this.hoverActiveRoomId = room.id;
  }

  private resetHoverIntent(): void {
    this.clearHoverTimer();
    this.hoverCandidateRoomId = null;
    this.hoverClientPosition = null;
    this.hideHoverLabel();
  }

  private updateMoveToolHover(event: PointerEvent): void {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
      this.resetHoverIntent();
      return;
    }

    const point = this.translatePoint(event);
    if (!point) {
      this.resetHoverIntent();
      return;
    }

    const room = this.getRoomAtPoint(point);
    if (!room) {
      this.resetHoverIntent();
      return;
    }

    this.hoverClientPosition = { x: event.clientX, y: event.clientY };

    if (this.hoverActiveRoomId === room.id) {
      this.updateHoverLabelPosition();
      return;
    }

    if (this.hoverCandidateRoomId !== room.id) {
      this.hoverCandidateRoomId = room.id;
      this.clearHoverTimer();
      this.hideHoverLabel();
      this.hoverTimeoutId = window.setTimeout(() => {
        if (this.hoverCandidateRoomId !== room.id) {
          return;
        }
        const latestRoom = this.rooms.find((entry) => entry.id === room.id);
        if (!latestRoom) {
          return;
        }
        this.showHoverLabel(latestRoom);
      }, 1000);
      return;
    }

    if (!this.hoverActiveRoomId) {
      this.updateHoverLabelPosition();
    }
  }

  private applyMagnify(point: Point): void {
    if (!this.overlayCanvas.width || !this.overlayCanvas.height) {
      return;
    }

    const nextIndex = (this.magnifyIndex + 1) % this.magnifyScales.length;
    if (nextIndex === 0) {
      this.resetMagnifyTransform();
      return;
    }

    const scale = this.magnifyScales[nextIndex];
    const percentX = clamp((point.x / this.overlayCanvas.width) * 100, 0, 100);
    const percentY = clamp((point.y / this.overlayCanvas.height) * 100, 0, 100);
    const origin = `${percentX}% ${percentY}%`;

    this.magnifyIndex = nextIndex;
    this.magnifyOrigin = origin;
    this.updateCanvasTransform(scale, origin);
    this.updateCanvasCursor();
  }

  private updateCanvasTransform(scale: number, origin: string, withTransition = true): void {
    const transformValue = `translate(${this.panOffset.x}px, ${this.panOffset.y}px) scale(${scale})`;
    [this.imageCanvas, this.overlayCanvas, this.selectionCanvas].forEach((canvas) => {
      canvas.style.transition = withTransition ? this.magnifyTransition : "none";
      canvas.style.transformOrigin = origin;
      canvas.style.transform = transformValue;
    });
  }

  private resetMagnifyTransform(useDefaultOrigin = false): void {
    this.magnifyIndex = 0;
    if (useDefaultOrigin) {
      this.magnifyOrigin = "50% 50%";
    }
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStartClient = null;
    this.panStartOffset = null;
    this.panPointerId = null;
    this.panHasMoved = false;
    this.pendingSelectionPoint = null;
    this.pendingSelectionPointerId = null;
    this.updateCanvasTransform(1, this.magnifyOrigin);
    this.updateCanvasCursor();
  }

  private updateCanvasCursor(): void {
    if (!this.overlayCanvas) {
      return;
    }

    if (this.currentTool === "brush" || this.currentTool === "eraser") {
      this.overlayCanvas.style.cursor = "none";
      return;
    }

    if (this.currentTool === "magnify") {
      const nextIndex = (this.magnifyIndex + 1) % this.magnifyScales.length;
      this.overlayCanvas.style.cursor = nextIndex === 0 ? "zoom-out" : "zoom-in";
      return;
    }

    if (this.currentTool === "move") {
      if (this.magnifyIndex === 0) {
        this.overlayCanvas.style.cursor = "default";
      } else {
        this.overlayCanvas.style.cursor = this.isPanning ? "grabbing" : "grab";
      }
      return;
    }

    this.overlayCanvas.style.cursor = "";
  }

  private translatePoint(event: PointerEvent): Point | null {
    return this.clientToCanvasPoint(event.clientX, event.clientY);
  }

  private clientToCanvasPoint(clientX: number, clientY: number): Point | null {
    const rect = this.overlayCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const scaleX = this.overlayCanvas.width / rect.width;
    const scaleY = this.overlayCanvas.height / rect.height;
    const x = clamp((clientX - rect.left) * scaleX, 0, this.overlayCanvas.width - 1);
    const y = clamp((clientY - rect.top) * scaleY, 0, this.overlayCanvas.height - 1);
    return { x, y };
  }

  private getViewportCenterPoint(): Point | null {
    if (!this.canvasWrapper) {
      return null;
    }

    const wrapperRect = this.canvasWrapper.getBoundingClientRect();
    if (wrapperRect.width === 0 || wrapperRect.height === 0) {
      return null;
    }

    const centerClientX = wrapperRect.left + wrapperRect.width / 2;
    const centerClientY = wrapperRect.top + wrapperRect.height / 2;
    return this.clientToCanvasPoint(centerClientX, centerClientY);
  }

  private applyBrush(from: Point, to: Point, value: 0 | 1): void {
    const room = this.getActiveRoom();
    if (!room || !this.imageData) {
      return;
    }
    const radius = this.brushRadius;
    const width = this.imageData.width;
    const height = this.imageData.height;
    const mask = room.mask;

    const stamp = (point: Point) => {
      const cx = clamp(Math.round(point.x), 0, width - 1);
      const cy = clamp(Math.round(point.y), 0, height - 1);
      const minX = clamp(cx - radius, 0, width - 1);
      const maxX = clamp(cx + radius, 0, width - 1);
      const minY = clamp(cy - radius, 0, height - 1);
      const maxY = clamp(cy + radius, 0, height - 1);
      const radiusSquared = radius * radius;
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= radiusSquared) {
            const index = y * width + x;
            if (value === 1 && !this.canAssignMask(room, index)) {
              continue;
            }
            mask[index] = value;
          }
        }
      }
    };

    bresenham(from, to, stamp);
  }

  private applyPolygon(points: Point[]): void {
    const room = this.getActiveRoom();
    if (!room || !this.imageData) {
      return;
    }
    const shouldFill = this.shouldRestrictMaskAssignments(room)
      ? (index: number) => this.canAssignMask(room, index)
      : undefined;
    fillPolygon(room.mask, this.imageData.width, this.imageData.height, points, 1, shouldFill);
    this.renderOverlay();
  }

  private applyMagicWand(point: Point): void {
    const room = this.getActiveRoom();
    if (!room || !this.imageData || !this.grayscale) {
      return;
    }
    const width = this.imageData.width;
    const height = this.imageData.height;
    const startX = Math.round(point.x);
    const startY = Math.round(point.y);
    const index = startY * width + startX;
    const base = this.grayscale[index];
    const tolerance = this.magicWandTolerance;
    const visited = new Uint8Array(width * height);
    const queue: number[] = [index];
    const toFill: number[] = [];

    while (queue.length > 0) {
      const current = queue.shift() as number;
      if (visited[current]) {
        continue;
      }
      visited[current] = 1;
      const currentValue = this.grayscale[current];
      if (Math.abs(currentValue - base) <= tolerance) {
        toFill.push(current);
        const cx = current % width;
        const cy = Math.floor(current / width);
        const neighbors = [
          { x: cx + 1, y: cy },
          { x: cx - 1, y: cy },
          { x: cx, y: cy + 1 },
          { x: cx, y: cy - 1 }
        ];
        neighbors.forEach(({ x, y }) => {
          if (x >= 0 && x < width && y >= 0 && y < height) {
            queue.push(y * width + x);
          }
        });
      }
    }

    const restrict = this.shouldRestrictMaskAssignments(room);
    toFill.forEach((idx) => {
      if (restrict && !this.canAssignMask(room, idx)) {
        return;
      }
      room.mask[idx] = 1;
    });
    this.renderOverlay();
  }

  private snapToEdge(point: Point): Point {
    if (!this.gradient || !this.imageData) {
      return { x: Math.round(point.x), y: Math.round(point.y) };
    }
    const width = this.imageData.width;
    const height = this.imageData.height;
    const radius = this.magneticRadius;
    const baseX = Math.round(point.x);
    const baseY = Math.round(point.y);
    let bestPoint: Point = { x: baseX, y: baseY };
    let bestScore = -Infinity;

    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = baseY + dy;
      if (y < 0 || y >= height) {
        continue;
      }
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = baseX + dx;
        if (x < 0 || x >= width) {
          continue;
        }
        const idx = y * width + x;
        const gradientValue = this.gradient[idx];
        const distanceWeight = Math.sqrt(dx * dx + dy * dy) || 1;
        const score = gradientValue - distanceWeight * 2;
        if (score > bestScore) {
          bestScore = score;
          bestPoint = { x, y };
        }
      }
    }

    return bestPoint;
  }

  private updateBrushPreview(point: Point): void {
    this.brushPreviewPoint = point;
    this.renderSelectionOverlay();
  }

  private clearBrushPreview(): void {
    if (!this.brushPreviewPoint) {
      return;
    }
    this.brushPreviewPoint = null;
    this.renderSelectionOverlay();
  }

  private renderSelectionOverlay(): void {
    this.selectionContext.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);

    if (this.isAdjustingBrushSize && (this.currentTool === "brush" || this.currentTool === "eraser")) {
      const viewportCenter = this.getViewportCenterPoint();
      const centerX = viewportCenter ? viewportCenter.x : this.selectionCanvas.width / 2;
      const centerY = viewportCenter ? viewportCenter.y : this.selectionCanvas.height / 2;
      this.selectionContext.save();
      this.selectionContext.lineWidth = 1.5;
      const strokeColor = this.currentTool === "eraser" ? "#ffffff" : "#00f5d4";
      const fillColor = this.currentTool === "eraser" ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 245, 212, 0.18)";
      this.selectionContext.strokeStyle = strokeColor;
      this.selectionContext.fillStyle = fillColor;
      this.selectionContext.beginPath();
      this.selectionContext.arc(centerX, centerY, this.brushRadius, 0, Math.PI * 2);
      this.selectionContext.fill();
      this.selectionContext.stroke();
      this.selectionContext.restore();
    }

    if (
      this.brushPreviewPoint &&
      (this.currentTool === "brush" || this.currentTool === "eraser")
    ) {
      this.selectionContext.save();
      this.selectionContext.lineWidth = 1.5;
      this.selectionContext.strokeStyle = this.currentTool === "eraser" ? "#ffffff" : "#00f5d4";
      this.selectionContext.setLineDash([]);
      this.selectionContext.beginPath();
      this.selectionContext.arc(
        this.brushPreviewPoint.x,
        this.brushPreviewPoint.y,
        this.brushRadius,
        0,
        Math.PI * 2
      );
      this.selectionContext.stroke();
      this.selectionContext.restore();
    }

    if (this.lassoPath.length < 2) {
      return;
    }

    this.selectionContext.save();
    this.selectionContext.lineWidth = 1.5;
    this.selectionContext.strokeStyle = "#00f5d4";
    this.selectionContext.setLineDash([6, 4]);
    this.selectionContext.beginPath();
    const first = this.lassoPath[0];
    this.selectionContext.moveTo(first.x, first.y);
    for (let i = 1; i < this.lassoPath.length; i += 1) {
      const point = this.lassoPath[i];
      this.selectionContext.lineTo(point.x, point.y);
    }
    this.selectionContext.stroke();
    this.selectionContext.restore();
  }

  private shouldRestrictMaskAssignments(room: Room): boolean {
    return this.isConfirmingRoom && this.pendingRoomId === room.id;
  }

  private canAssignMask(room: Room, index: number): boolean {
    if (!this.shouldRestrictMaskAssignments(room)) {
      return true;
    }
    return !this.rooms.some((other) => other.id !== room.id && other.mask[index]);
  }

  private renderOverlay(): void {
    if (!this.imageData) {
      return;
    }
    const width = this.imageData.width;
    const height = this.imageData.height;
    const imageData = this.overlayContext.createImageData(width, height);
    const data = imageData.data;

    for (let i = 0; i < width * height; i += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let contributions = 0;
      this.rooms.forEach((room) => {
        if (room.mask[i]) {
          r += room.colorVector[0];
          g += room.colorVector[1];
          b += room.colorVector[2];
          a += 140;
          contributions += 1;
        }
      });
      if (contributions > 0) {
        const index = i * 4;
        data[index] = Math.min(255, Math.round(r / contributions));
        data[index + 1] = Math.min(255, Math.round(g / contributions));
        data[index + 2] = Math.min(255, Math.round(b / contributions));
        data[index + 3] = clamp(a, 80, 200);
      }
    }

    this.overlayContext.putImageData(imageData, 0, 0);
  }
}
