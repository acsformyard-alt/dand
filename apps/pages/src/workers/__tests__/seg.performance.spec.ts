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

const createSparseEdgeFixture = (width = 128, height = 128): Uint8Fixture => {
  const data = new Uint8Array(width * height);
  const verticalEdges = [Math.floor(width * 0.25), Math.floor(width * 0.65)];
  const horizontalEdge = Math.floor(height * 0.55);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (x / Math.max(1, width - 1)) * 80 + (y / Math.max(1, height - 1)) * 20;
      data[y * width + x] = Math.round(base);
    }
  }

  for (const x of verticalEdges) {
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y += 1) {
      data[y * width + x] = 240;
    }
  }

  for (let x = Math.floor(width * 0.2); x < Math.floor(width * 0.9); x += 1) {
    data[horizontalEdge * width + x] = 12;
  }

  for (let i = 0; i < Math.min(width, height); i += 1) {
    const x = Math.min(width - 1, Math.floor(width * 0.45) + Math.floor(i * 0.35));
    const y = Math.min(height - 1, Math.floor(height * 0.2) + i);
    if (x >= 0 && x < width && y >= 0 && y < height) {
      data[y * width + x] = 200;
    }
  }

  return { width, height, data };
};

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
  const circles: Array<{ cx: number; cy: number; radius: number }> = [];
  const baseRadius = Math.min(width, height) * 0.08;

  const paintCircle = (cx: number, cy: number, radius: number) => {
    const xMin = Math.max(0, Math.floor(cx - radius - 1));
    const xMax = Math.min(width - 1, Math.ceil(cx + radius + 1));
    const yMin = Math.max(0, Math.floor(cy - radius - 1));
    const yMax = Math.min(height - 1, Math.ceil(cy + radius + 1));
    const radiusSquared = radius * radius;

    for (let y = yMin; y <= yMax; y += 1) {
      const dy = y - cy;
      for (let x = xMin; x <= xMax; x += 1) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= radiusSquared) {
          data[y * width + x] = 1;
        }
      }
    }
  };

  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    const sinOffset = Math.sin(t * Math.PI);
    const cosOffset = Math.cos(t * Math.PI * 0.75);
    circles.push({
      cx: width * (0.28 + t * 0.44 + sinOffset * 0.05),
      cy: height * (0.32 + t * 0.28 + cosOffset * 0.04),
      radius: baseRadius * (0.85 + 0.25 * sinOffset),
    });
  }

  circles.push(
    { cx: width * 0.45, cy: height * 0.58, radius: baseRadius * 1.05 },
    { cx: width * 0.58, cy: height * 0.52, radius: baseRadius * 0.95 },
    { cx: width * 0.66, cy: height * 0.46, radius: baseRadius * 0.8 },
    { cx: width * 0.52, cy: height * 0.42, radius: baseRadius * 0.7 }
  );

  for (const circle of circles) {
    paintCircle(circle.cx, circle.cy, circle.radius);
  }

  const interiorX = Math.floor(width * 0.5);
  const interiorY = Math.floor(height * 0.52);
  const interiorIndex = interiorY * width + interiorX;

  if (data[interiorIndex] === 0) {
    paintCircle(interiorX, interiorY, baseRadius * 0.9);
  }

  const preferredExterior = [
    { x: Math.floor(width * 0.1), y: Math.floor(height * 0.1) },
    { x: Math.floor(width * 0.85), y: Math.floor(height * 0.15) },
    { x: Math.floor(width * 0.12), y: Math.floor(height * 0.85) },
  ];

  let exteriorIndex = preferredExterior[0].y * width + preferredExterior[0].x;
  for (const candidate of preferredExterior) {
    const index = candidate.y * width + candidate.x;
    if (data[index] === 0) {
      exteriorIndex = index;
      break;
    }
  }

  return { width, height, data, interiorIndex, exteriorIndex };
};

describe('segmentation performance characteristics', () => {
  it('keeps repeated live wire traces on sparse edges within latency budget', () => {
    const fixture = createSparseEdgeFixture();
    const pyramid = buildCostPyramid(fixture.data, fixture.width, fixture.height, {
      levels: 4,
      smoothIterations: 1,
    });

    const toNormalized = (x: number, size: number) => x / Math.max(1, size - 1);

    const pointPairs: Array<{ start: Point; end: Point }> = [
      {
        start: { x: toNormalized(Math.floor(fixture.width * 0.1), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.2), fixture.height) },
        end: { x: toNormalized(Math.floor(fixture.width * 0.4), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.28), fixture.height) },
      },
      {
        start: { x: toNormalized(Math.floor(fixture.width * 0.32), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.12), fixture.height) },
        end: { x: toNormalized(Math.floor(fixture.width * 0.35), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.45), fixture.height) },
      },
      {
        start: { x: toNormalized(Math.floor(fixture.width * 0.45), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.45), fixture.height) },
        end: { x: toNormalized(Math.floor(fixture.width * 0.68), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.68), fixture.height) },
      },
      {
        start: { x: toNormalized(Math.floor(fixture.width * 0.55), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.6), fixture.height) },
        end: { x: toNormalized(Math.floor(fixture.width * 0.82), fixture.width), y: toNormalized(Math.floor(fixture.height * 0.75), fixture.height) },
      },
    ];

    for (const pair of pointPairs) {
      const path = traceLiveWire(pyramid, pair.start, pair.end, { allowDiagonals: true });
      expect(path.length).toBeGreaterThan(5);
      expect(Math.abs(path[0].x - pair.start.x)).toBeLessThan(0.05);
      expect(Math.abs(path[path.length - 1].y - pair.end.y)).toBeLessThan(0.05);
    }

    const iterations = 20;
    const durations: number[] = [];

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const pair of pointPairs) {
        const start = performance.now();
        traceLiveWire(pyramid, pair.start, pair.end, { allowDiagonals: true });
        const duration = performance.now() - start;
        durations.push(duration);
      }
    }

    const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    const sorted = [...durations].sort((a, b) => a - b);
    const index95 = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const percentile95 = sorted[index95];
    const thresholdMs = 12;

    if (average >= thresholdMs) {
      throw new Error(
        `traceLiveWire average ${average.toFixed(3)}ms exceeded latency budget of ${thresholdMs}ms (95th percentile ${percentile95.toFixed(3)}ms across ${durations.length} runs)`
      );
    }
  });

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
    const runs = 8;
    const durations: number[] = [];
    let warmupDuration = 0;
    let field: ReturnType<typeof computeSignedDistanceField> | null = null;

    for (let run = 0; run < runs; run += 1) {
      const start = performance.now();
      const result = computeSignedDistanceField(fixture.data, fixture.width, fixture.height);
      const duration = performance.now() - start;

      if (run === 0) {
        warmupDuration = duration;
      } else {
        durations.push(duration);
      }

      field = result;
    }

    if (field === null) {
      throw new Error('Failed to compute signed distance field during benchmark');
    }

    const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    const thresholdMs = 25;

    if (average >= thresholdMs) {
      const formattedDurations = durations.map((value) => value.toFixed(3)).join(', ');
      console.warn(
        `computeSignedDistanceField average ${average.toFixed(3)}ms exceeded latency budget of ${thresholdMs}ms after warm-up ${warmupDuration.toFixed(
          3
        )}ms (runs: ${formattedDurations})`
      );
    }

    expect(field.values.length).toBe(fixture.width * fixture.height);
    expect(field.values[fixture.interiorIndex]).toBeLessThan(0);
    expect(field.values[fixture.exteriorIndex]).toBeGreaterThan(0);
    expect(average).toBeLessThan(thresholdMs);
  });
});
