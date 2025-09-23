import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
