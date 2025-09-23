import { describe, expect, it } from 'vitest';
import type { Point } from '../../state/defineRoomsStore';
import { buildCostPyramid, computeSignedDistanceField, traceLiveWire } from '../seg';

type Uint8Fixture = {
  width: number;
  height: number;
  data: Uint8Array;
};

interface LiveWireFixture extends Uint8Fixture {
  start: Point;
  end: Point;
}

const createLiveWireFixture = (width = 128, height = 128): LiveWireFixture => {
  const data = new Uint8Array(width * height);
  const corridorTop = Math.floor(height * 0.4);
  const corridorBottom = Math.floor(height * 0.6);
  const bendOffset = Math.floor(height * 0.1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let value = Math.round((x / Math.max(1, width - 1)) * 180 + (y / Math.max(1, height - 1)) * 40);

      if (y >= corridorTop && y <= corridorBottom) {
        const localY = y - corridorTop;
        const corridorHeight = corridorBottom - corridorTop + 1;
        const normalizedRow = localY / Math.max(1, corridorHeight - 1);
        const diagonalShift = Math.round(normalizedRow * bendOffset);
        if (x >= 4 + diagonalShift && x <= width - 5 + diagonalShift) {
          value = 48;
        }
      }

      if (x > Math.floor(width * 0.65) && y >= corridorBottom) {
        value = Math.round(100 + (y / Math.max(1, height - 1)) * 90);
      }

      data[index] = value;
    }
  }

  const centerY = (corridorTop + corridorBottom) / 2;
  const start: Point = {
    x: 4 / Math.max(1, width - 1),
    y: centerY / Math.max(1, height - 1),
  };
  const end: Point = {
    x: (width - 5) / Math.max(1, width - 1),
    y: (centerY + bendOffset / 2) / Math.max(1, height - 1),
  };

  return { width, height, data, start, end };
};

const createMaskFixture = (width = 128, height = 128): Uint8Fixture & {
  interiorIndex: number;
  exteriorIndex: number;
} => {
  const data = new Uint8Array(width * height);
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * 0.28;
  const radiusY = height * 0.32;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;
      const inside = dx * dx + dy * dy <= 1;
      if (inside) {
        data[y * width + x] = 1;
      }
    }
  }

  const armHeight = Math.floor(height * 0.12);
  const armYMin = Math.floor(centerY - armHeight / 2);
  const armYMax = Math.floor(centerY + armHeight / 2);
  const armXMin = Math.floor(centerX);
  const armXMax = Math.min(width - 2, armXMin + Math.floor(width * 0.18));
  for (let y = armYMin; y <= armYMax; y += 1) {
    for (let x = armXMin; x <= armXMax; x += 1) {
      data[y * width + x] = 1;
    }
  }

  const interiorIndex = Math.floor(centerY) * width + Math.floor(centerX);
  const exteriorY = Math.max(0, Math.floor(centerY - radiusY) - 4);
  const exteriorIndex = exteriorY * width + Math.floor(centerX);

  return { width, height, data, interiorIndex, exteriorIndex };
};

describe('segmentation performance characteristics', () => {
  it('traces a live wire path through a moderately sized image quickly', () => {
    const fixture = createLiveWireFixture();
    const pyramid = buildCostPyramid(fixture.data, fixture.width, fixture.height, {
      levels: 4,
      smoothIterations: 2,
    });

    const start = performance.now();
    const path = traceLiveWire(pyramid, fixture.start, fixture.end, { allowDiagonals: true });
    const duration = performance.now() - start;

    expect(path.length).toBeGreaterThan(10);
    expect(Math.abs(path[0].x - fixture.start.x)).toBeLessThan(0.05);
    expect(Math.abs(path[path.length - 1].y - fixture.end.y)).toBeLessThan(0.05);
    expect(duration).toBeLessThan(60);
  });

  it('computes a signed distance field for a complex mask efficiently', () => {
    const fixture = createMaskFixture();

    const start = performance.now();
    const field = computeSignedDistanceField(fixture.data, fixture.width, fixture.height);
    const duration = performance.now() - start;

    expect(field.values.length).toBe(fixture.width * fixture.height);
    expect(field.values[fixture.interiorIndex]).toBeLessThan(0);
    expect(field.values[fixture.exteriorIndex]).toBeGreaterThan(0);
    expect(duration).toBeLessThan(60);
  });
});
