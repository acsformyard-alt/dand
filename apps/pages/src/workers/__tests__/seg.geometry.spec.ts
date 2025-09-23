import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCostPyramid,
  computeSignedDistanceField,
  smartWand,
  traceLiveWire,
} from '../seg';

interface PixelPoint {
  x: number;
  y: number;
}

interface GrayscaleFixture {
  width: number;
  height: number;
  data: Uint8Array;
  wallColumn: number;
  gap: { top: number; bottom: number };
}

interface ColorFixture {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  wallColumn: number;
  gap: { top: number; bottom: number };
  region: { minX: number; maxX: number; minY: number; maxY: number; area: number };
}

interface MaskFixture {
  width: number;
  height: number;
  data: Uint8Array;
  interior: { minX: number; maxX: number; minY: number; maxY: number };
}

const GRID_SIZE = 32;
const WALL_COLUMN = 15;
const GAP_TOP = 12;
const GAP_BOTTOM = 19;

const createGrayscaleFixture = (): GrayscaleFixture => {
  const width = GRID_SIZE;
  const height = GRID_SIZE;
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let value = 24;
      if (x > WALL_COLUMN) {
        value = 96;
      }
      if (x === WALL_COLUMN) {
        value = 240;
        if (y >= GAP_TOP && y <= GAP_BOTTOM) {
          value = 24;
        }
      }
      if (y === GAP_TOP - 2 && x < WALL_COLUMN - 1) {
        value = 48;
      }
      if (y === GAP_BOTTOM + 2 && x > WALL_COLUMN) {
        value = 72;
      }
      data[index] = value;
    }
  }

  return {
    width,
    height,
    data,
    wallColumn: WALL_COLUMN,
    gap: { top: GAP_TOP, bottom: GAP_BOTTOM },
  };
};

const createColorFixture = (): ColorFixture => {
  const width = GRID_SIZE;
  const height = GRID_SIZE;
  const data = new Uint8ClampedArray(width * height * 4);
  const background: [number, number, number, number] = [20, 20, 20, 255];
  const leftColor: [number, number, number, number] = [96, 128, 160, 255];
  const rightColor: [number, number, number, number] = [180, 136, 96, 255];
  const wallColor: [number, number, number, number] = [240, 240, 240, 255];

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let area = 0;

  const setPixel = (x: number, y: number, color: [number, number, number, number]) => {
    const offset = (y * width + x) * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = color[3];
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = background;
      if (x === WALL_COLUMN) {
        color = wallColor;
        if (y >= GAP_TOP && y <= GAP_BOTTOM) {
          color = leftColor;
        }
      } else if (x >= 2 && x <= WALL_COLUMN - 1 && y >= 2 && y <= height - 3) {
        color = leftColor;
      } else if (x >= WALL_COLUMN + 1 && x <= width - 3 && y >= 3 && y <= height - 4) {
        color = rightColor;
      }

      setPixel(x, y, color);

      if (color === leftColor) {
        area += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    width,
    height,
    data,
    wallColumn: WALL_COLUMN,
    gap: { top: GAP_TOP, bottom: GAP_BOTTOM },
    region: { minX, maxX, minY, maxY, area },
  };
};

const createMaskFixture = (): MaskFixture => {
  const width = GRID_SIZE;
  const height = GRID_SIZE;
  const data = new Uint8Array(width * height);
  const margin = 6;
  const interior = {
    minX: margin,
    minY: margin,
    maxX: width - margin - 1,
    maxY: height - margin - 1,
  };

  for (let y = interior.minY; y <= interior.maxY; y += 1) {
    for (let x = interior.minX; x <= interior.maxX; x += 1) {
      data[y * width + x] = 1;
    }
  }

  return { width, height, data, interior };
};

const toPixelPolygon = (polygon: PixelPoint[], width: number, height: number): PixelPoint[] =>
  polygon.map((point) => ({
    x: Math.round(point.x * (width - 1)),
    y: Math.round(point.y * (height - 1)),
  }));

const toPixelPoint = (point: PixelPoint, width: number, height: number): PixelPoint => ({
  x: Math.round(point.x * (width - 1)),
  y: Math.round(point.y * (height - 1)),
});

let grayscaleFixture: GrayscaleFixture;
let colorFixture: ColorFixture;
let maskFixture: MaskFixture;

beforeEach(() => {
  grayscaleFixture = createGrayscaleFixture();
  colorFixture = createColorFixture();
  maskFixture = createMaskFixture();
  vi.clearAllMocks();
});

describe('buildCostPyramid', () => {
  it('produces smoothed gradients with prominent cost along walls', () => {
    const { data, width, height, wallColumn } = grayscaleFixture;

    const pyramid = buildCostPyramid(data, width, height);

    expect(pyramid.levels).toHaveLength(4);
    const base = pyramid.levels[0];
    expect(base.width).toBe(width);
    expect(base.height).toBe(height);

    const sampleY = GAP_TOP - 1;
    const wallIndex = sampleY * width + (wallColumn - 1);
    const quietIndex = sampleY * width + 3;

    expect(base.data[wallIndex]).toBeGreaterThan(base.data[quietIndex] * 10 + 1);
    expect(base.data[wallIndex]).toBeGreaterThan(40);

    const highestLevel = pyramid.levels[pyramid.levels.length - 1];
    expect(highestLevel.scale).toBe(2 ** (pyramid.levels.length - 1));
    expect(highestLevel.width).toBeGreaterThanOrEqual(1);
    expect(highestLevel.height).toBeGreaterThanOrEqual(1);
  });
});

describe('traceLiveWire', () => {
  it('navigates around high-cost barriers to use the designed gap', () => {
    const { data, width, height, wallColumn, gap } = grayscaleFixture;
    const pyramid = buildCostPyramid(data, width, height);

    const start = { x: 2 / (width - 1), y: 3 / (height - 1) };
    const end = { x: (width - 3) / (width - 1), y: (height - 4) / (height - 1) };

    const path = traceLiveWire(pyramid, start, end);
    const pixels = toPixelPolygon(path, width, height);

    expect(pixels[0]).toEqual(toPixelPoint(start, width, height));
    expect(pixels[pixels.length - 1]).toEqual(toPixelPoint(end, width, height));

    const gapCrossings = pixels.filter(
      (point) =>
        point.x >= wallColumn &&
        point.x <= wallColumn + 1 &&
        point.y >= gap.top &&
        point.y <= gap.bottom
    );
    expect(gapCrossings.length).toBeGreaterThan(0);

    const blockedCrossings = pixels.filter(
      (point) =>
        point.x === wallColumn && (point.y < gap.top || point.y > gap.bottom)
    );
    expect(blockedCrossings.length).toBe(0);
  });

  it('keeps the live wire constrained to a low-cost rectangular corridor', () => {
    const width = 32;
    const height = 24;
    const corridor = {
      minX: 6,
      maxX: width - 7,
      minY: 5,
      maxY: height - 6,
    };

    const backgroundValue = 32;
    const wallValue = 240;
    const corridorValue = 16;
    const image = new Uint8Array(width * height);
    image.fill(backgroundValue);

    for (let y = corridor.minY - 1; y <= corridor.maxY + 1; y += 1) {
      for (let x = corridor.minX - 1; x <= corridor.maxX + 1; x += 1) {
        const index = y * width + x;
        if (x >= corridor.minX && x <= corridor.maxX && y >= corridor.minY && y <= corridor.maxY) {
          image[index] = corridorValue;
        } else {
          image[index] = wallValue;
        }
      }
    }

    const pyramid = buildCostPyramid(image, width, height);

    const start = {
      x: corridor.minX / (width - 1),
      y: corridor.minY / (height - 1),
    };
    const end = {
      x: corridor.maxX / (width - 1),
      y: corridor.maxY / (height - 1),
    };

    const path = traceLiveWire(pyramid, start, end);
    const pixels = toPixelPolygon(path, width, height);

    expect(pixels.length).toBeGreaterThan(2);

    const requestedStart = toPixelPoint(start, width, height);
    const requestedEnd = toPixelPoint(end, width, height);
    const startDeltaX = Math.abs(pixels[0].x - requestedStart.x);
    const startDeltaY = Math.abs(pixels[0].y - requestedStart.y);
    const endDeltaX = Math.abs(pixels[pixels.length - 1].x - requestedEnd.x);
    const endDeltaY = Math.abs(pixels[pixels.length - 1].y - requestedEnd.y);

    expect(startDeltaX).toBeLessThanOrEqual(1);
    expect(startDeltaY).toBeLessThanOrEqual(1);
    expect(endDeltaX).toBeLessThanOrEqual(1);
    expect(endDeltaY).toBeLessThanOrEqual(1);

    for (let i = 1; i < pixels.length - 1; i += 1) {
      const point = pixels[i];
      expect(point.x).toBeGreaterThanOrEqual(corridor.minX);
      expect(point.x).toBeLessThanOrEqual(corridor.maxX);
      expect(point.y).toBeGreaterThanOrEqual(corridor.minY);
      expect(point.y).toBeLessThanOrEqual(corridor.maxY);
    }
  });
});

describe('smartWand', () => {
  it('returns a polygon constrained to the seeded room', () => {
    const { data, width, height, wallColumn, region } = colorFixture;

    const seed = {
      x: (region.minX + 1) / (width - 1),
      y: (region.minY + 1) / (height - 1),
    };

    const result = smartWand(data, width, height, seed, {
      tolerance: 32,
      connectivity: 8,
    });

    const filledArea = result.mask.reduce((total, value) => total + value, 0);
    expect(filledArea).toBe(result.area);
    expect(result.area).toBe(region.area);

    expect(result.bounds.minX).toBeCloseTo(region.minX / (width - 1), 5);
    expect(result.bounds.maxX).toBeCloseTo(region.maxX / (width - 1), 5);
    expect(result.bounds.minY).toBeCloseTo(region.minY / (height - 1), 5);
    expect(result.bounds.maxY).toBeCloseTo(region.maxY / (height - 1), 5);

    const polygon = toPixelPolygon(result.polygon, width, height);
    const xs = polygon.map((point) => point.x);
    const ys = polygon.map((point) => point.y);

    expect(Math.min(...xs)).toBeGreaterThanOrEqual(region.minX - 1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(region.maxX + 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(region.minY - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(region.maxY + 1);

    const wallIndex = (region.minY + 1) * width + wallColumn;
    expect(result.mask[wallIndex]).toBe(0);
  });
});

describe('computeSignedDistanceField', () => {
  it('reports positive interior distances and negative exterior distances', () => {
    const { data, width, height, interior } = maskFixture;

    const field = computeSignedDistanceField(data, width, height);

    expect(field.width).toBe(width);
    expect(field.height).toBe(height);
    expect(field.bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });

    const centerX = Math.floor((interior.minX + interior.maxX) / 2);
    const centerY = Math.floor((interior.minY + interior.maxY) / 2);
    const centerIndex = centerY * width + centerX;
    expect(field.values[centerIndex]).toBeGreaterThan(0);

    const outsideIndex = (interior.minY - 2) * width + (interior.minX - 2);
    expect(field.values[outsideIndex]).toBeLessThan(0);

    const boundaryIndex = interior.minY * width + interior.minX;
    expect(Math.abs(field.values[boundaryIndex])).toBeLessThanOrEqual(1 / GRID_SIZE);
  });
});
