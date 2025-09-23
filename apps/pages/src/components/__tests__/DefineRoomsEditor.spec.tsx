import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DefineRoomsEditor from '../DefineRoomsEditor';

const DEFAULT_IMAGE_DIMENSIONS = { width: 2048, height: 1024 };
const DEFAULT_CONTAINER_RECT = {
  x: 24,
  y: 32,
  width: 960,
  height: 640,
  top: 32,
  left: 24,
  right: 24 + 960,
  bottom: 32 + 640,
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      top: this.top,
      left: this.left,
      right: this.right,
      bottom: this.bottom,
    };
  },
};

let mockContainerRect = { ...DEFAULT_CONTAINER_RECT };
let mockImageNaturalSize = { ...DEFAULT_IMAGE_DIMENSIONS };
let mockImageComplete = true;

const originalResizeObserver = globalThis.ResizeObserver;
const originalSetPointerCapture = SVGElement.prototype.setPointerCapture;
const originalReleasePointerCapture = SVGElement.prototype.releasePointerCapture;
const originalDivGetBoundingClientRect = HTMLDivElement.prototype.getBoundingClientRect;
const originalImageNaturalWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
const originalImageNaturalHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalHeight');
const originalImageCompleteDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');

class MockResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: { ...mockContainerRect },
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    );
  }

  unobserve() {}

  disconnect() {}
}

beforeEach(() => {
  mockContainerRect = { ...DEFAULT_CONTAINER_RECT };
  mockImageNaturalSize = { ...DEFAULT_IMAGE_DIMENSIONS };
  mockImageComplete = true;

  (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;

  Object.defineProperty(SVGElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });

  Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: vi.fn(() => ({ ...mockContainerRect })),
  });

  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', {
    configurable: true,
    get() {
      return mockImageNaturalSize.width;
    },
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', {
    configurable: true,
    get() {
      return mockImageNaturalSize.height;
    },
  });
  Object.defineProperty(HTMLImageElement.prototype, 'complete', {
    configurable: true,
    get() {
      return mockImageComplete;
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();

  mockContainerRect = { ...DEFAULT_CONTAINER_RECT };
  mockImageNaturalSize = { ...DEFAULT_IMAGE_DIMENSIONS };
  mockImageComplete = true;

  if (originalResizeObserver) {
    (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = originalResizeObserver;
  } else {
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  }

  if (originalSetPointerCapture) {
    Object.defineProperty(SVGElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: originalSetPointerCapture,
    });
  } else {
    delete (SVGElement.prototype as { setPointerCapture?: typeof SVGElement.prototype.setPointerCapture }).setPointerCapture;
  }

  if (originalReleasePointerCapture) {
    Object.defineProperty(SVGElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: originalReleasePointerCapture,
    });
  } else {
    delete (
      SVGElement.prototype as { releasePointerCapture?: typeof SVGElement.prototype.releasePointerCapture }
    ).releasePointerCapture;
  }

  if (originalDivGetBoundingClientRect) {
    Object.defineProperty(HTMLDivElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: originalDivGetBoundingClientRect,
    });
  } else {
    delete (HTMLDivElement.prototype as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect;
  }

  if (originalImageNaturalWidthDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', originalImageNaturalWidthDescriptor);
  } else {
    delete (HTMLImageElement.prototype as { naturalWidth?: number }).naturalWidth;
  }

  if (originalImageNaturalHeightDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', originalImageNaturalHeightDescriptor);
  } else {
    delete (HTMLImageElement.prototype as { naturalHeight?: number }).naturalHeight;
  }

  if (originalImageCompleteDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, 'complete', originalImageCompleteDescriptor);
  } else {
    delete (HTMLImageElement.prototype as { complete?: boolean }).complete;
  }
});

type DefineRoomsEditorProps = Parameters<typeof DefineRoomsEditor>[0];

export const renderEditor = async (overrideProps: Partial<DefineRoomsEditorProps> = {}) => {
  const onRoomsChange = overrideProps.onRoomsChange ?? vi.fn();

  const props: DefineRoomsEditorProps = {
    imageUrl: overrideProps.imageUrl ?? 'https://example.com/floorplan.png',
    imageDimensions: overrideProps.imageDimensions ?? { ...DEFAULT_IMAGE_DIMENSIONS },
    rooms: overrideProps.rooms ?? [],
    onRoomsChange,
  };

  if (props.imageDimensions) {
    mockImageNaturalSize = { ...props.imageDimensions };
  }
  mockImageComplete = true;

  const user = userEvent.setup();

  const view = render(<DefineRoomsEditor {...props} />);

  const image = (await screen.findByRole('img', { name: 'Map editor' })) as HTMLImageElement;
  fireEvent.load(image);

  const overlay = (await screen.findByRole('presentation')) as SVGSVGElement;
  const container = image.parentElement as HTMLDivElement;

  return {
    ...view,
    container,
    image,
    overlay,
    onRoomsChange,
    user,
  };
};

describe('DefineRoomsEditor harness', () => {
  it('renders an overlay once the mocked image has loaded', async () => {
    const { overlay } = await renderEditor();
    expect(overlay.tagName).toBe('SVG');
  });
});

describe('DefineRoomsEditor room authoring', () => {
  it('allows completing a smart lasso room and resets to idle state', async () => {
    const { overlay, onRoomsChange, user } = await renderEditor();

    const idleAddRoomButton = screen.getByRole('button', { name: /add room/i });
    expect(idleAddRoomButton).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finish room/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();

    await user.click(idleAddRoomButton);

    const cancelButton = await screen.findByRole('button', { name: /cancel/i });
    expect(cancelButton).toBeInTheDocument();
    const finishButton = screen.getByRole('button', { name: /finish room/i });
    expect(finishButton).toBeDisabled();

    const containerRatio = DEFAULT_CONTAINER_RECT.width / DEFAULT_CONTAINER_RECT.height;
    const imageRatio = DEFAULT_IMAGE_DIMENSIONS.width / DEFAULT_IMAGE_DIMENSIONS.height;
    let overlayWidth: number;
    let overlayHeight: number;
    if (imageRatio > containerRatio) {
      overlayWidth = DEFAULT_CONTAINER_RECT.width;
      overlayHeight = overlayWidth / imageRatio;
    } else {
      overlayHeight = DEFAULT_CONTAINER_RECT.height;
      overlayWidth = overlayHeight * imageRatio;
    }
    const offsetX = (DEFAULT_CONTAINER_RECT.width - overlayWidth) / 2;
    const offsetY = (DEFAULT_CONTAINER_RECT.height - overlayHeight) / 2;

    const toEventCoordinates = (point: { x: number; y: number }) => ({
      clientX: DEFAULT_CONTAINER_RECT.left + offsetX + point.x * overlayWidth,
      clientY: DEFAULT_CONTAINER_RECT.top + offsetY + point.y * overlayHeight,
    });

    const strokePoints = [
      { x: 0.2, y: 0.2 },
      { x: 0.35, y: 0.22 },
      { x: 0.5, y: 0.25 },
      { x: 0.65, y: 0.3 },
      { x: 0.75, y: 0.4 },
      { x: 0.78, y: 0.5 },
      { x: 0.72, y: 0.6 },
      { x: 0.6, y: 0.7 },
      { x: 0.45, y: 0.75 },
      { x: 0.3, y: 0.65 },
    ];

    const pointerId = 1;
    const [startPoint, ...restPoints] = strokePoints;
    fireEvent.pointerDown(overlay, {
      pointerId,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      ...toEventCoordinates(startPoint),
    });
    restPoints.forEach((point) => {
      fireEvent.pointerMove(overlay, {
        pointerId,
        pointerType: 'mouse',
        button: 0,
        buttons: 1,
        ...toEventCoordinates(point),
      });
    });
    const finalPoint = restPoints[restPoints.length - 1] ?? startPoint;
    fireEvent.pointerUp(overlay, {
      pointerId,
      pointerType: 'mouse',
      button: 0,
      buttons: 0,
      ...toEventCoordinates(finalPoint),
    });

    await waitFor(() => expect(finishButton).not.toBeDisabled());

    await user.click(finishButton);

    await waitFor(() => expect(onRoomsChange).toHaveBeenCalledTimes(1));
    const call = onRoomsChange.mock.calls[0];
    expect(call).toBeDefined();
    const roomsArg = call?.[0];
    expect(Array.isArray(roomsArg)).toBe(true);
    const rooms = roomsArg as Array<{ mask: { data: Uint8ClampedArray }; maskManifest: { dataUrl: string } }>;
    expect(rooms).toHaveLength(1);
    const room = rooms[0];
    expect(room).toBeDefined();
    expect(room.mask.data.some((value) => value > 0)).toBe(true);
    expect(room.maskManifest.dataUrl).toMatch(/^data:image\/png;base64,/);

    const addRoomButton = await screen.findByRole('button', { name: /add room/i });
    expect(addRoomButton).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /finish room/i })).not.toBeInTheDocument();
    });
  });

  it('updates the active tool indicator and brush size slider across tool switches', async () => {
    const { user } = await renderEditor();

    await user.click(screen.getByRole('button', { name: /add room/i }));

    const activeToolIndicator = await screen.findByText(/active tool:/i);
    expect(activeToolIndicator).toHaveTextContent(/Active tool:\s*Smart Lasso/i);

    await user.click(screen.getByRole('button', { name: /auto wand/i }));
    await waitFor(() =>
      expect(activeToolIndicator).toHaveTextContent(/Active tool:\s*Auto Wand/i)
    );

    await user.click(screen.getByRole('button', { name: /refine brush/i }));
    await waitFor(() =>
      expect(activeToolIndicator).toHaveTextContent(/Active tool:\s*Refine Brush/i)
    );

    const brushSizeSlider = (await screen.findByLabelText(/brush size/i)) as HTMLInputElement;
    expect(Number(brushSizeSlider.value)).toBeCloseTo(0.08);

    fireEvent.change(brushSizeSlider, { target: { value: '0.14' } });

    await waitFor(() =>
      expect(screen.getByText(/current radius:/i)).toHaveTextContent(/14% of the image width/i)
    );

    await user.click(screen.getByRole('button', { name: /smart lasso/i }));

    await waitFor(() =>
      expect(activeToolIndicator).toHaveTextContent(/Active tool:\s*Smart Lasso/i)
    );
    expect(Number((screen.getByLabelText(/brush size/i) as HTMLInputElement).value)).toBeCloseTo(0.14, 5);
    expect(screen.getByText(/current radius:/i)).toHaveTextContent(/14% of the image width/i);
  });
});
