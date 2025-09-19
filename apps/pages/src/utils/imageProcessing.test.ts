import { describe, expect, it } from 'vitest';
import { buildEdgeMap, computeDisplayMetrics, snapPolygonToEdges } from './imageProcessing';
import type { EdgeMap } from './imageProcessing';

describe('computeDisplayMetrics', () => {
  it('returns centered display metrics for letterboxed images', () => {
    const metrics = computeDisplayMetrics(800, 600, 1600, 800);
    expect(metrics.displayWidth).toBeCloseTo(800);
    expect(metrics.displayHeight).toBeCloseTo(400);
    expect(metrics.offsetX).toBeCloseTo(0);
    expect(metrics.offsetY).toBeCloseTo(100);
  });
});

describe('buildEdgeMap', () => {
  it('captures Sobel gradients alongside magnitudes', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const value = x < width / 2 ? 0 : 255;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }

    const edgeMap = buildEdgeMap(data, width, height);
    expect(edgeMap.gradientX.length).toBe(width * height);
    expect(edgeMap.gradientY.length).toBe(width * height);

    const strongestIndex = edgeMap.magnitudes.reduce(
      (maxIndex, value, index, array) => (value > array[maxIndex] ? index : maxIndex),
      0
    );
    const magnitude = edgeMap.magnitudes[strongestIndex];
    expect(magnitude).toBeGreaterThan(0);
    const gx = edgeMap.gradientX[strongestIndex];
    const gy = edgeMap.gradientY[strongestIndex];
    expect(magnitude).toBeCloseTo(Math.hypot(gx, gy));
  });
});

describe('snapPolygonToEdges', () => {
  it('snaps vertices towards well-aligned edges', () => {
    const width = 5;
    const height = 5;
    const size = width * height;
    const magnitudes = new Float32Array(size);
    const gradientX = new Float32Array(size);
    const gradientY = new Float32Array(size);

    const setEdge = (
      x: number,
      y: number,
      values: { magnitude: number; gx: number; gy: number }
    ) => {
      const index = y * width + x;
      magnitudes[index] = values.magnitude;
      gradientX[index] = values.gx;
      gradientY[index] = values.gy;
    };

    setEdge(0, 2, { magnitude: 1, gx: 1, gy: 0 });
    setEdge(2, 2, { magnitude: 0.1, gx: 0, gy: 1 });
    setEdge(3, 2, { magnitude: 1, gx: 0, gy: 1 });

    const edgeMap: EdgeMap = {
      width,
      height,
      magnitudes,
      gradientX,
      gradientY,
      maxMagnitude: 1,
    };

    const polygon = [
      { x: 0.2, y: 0.6 },
      { x: 0.2, y: 0.4 },
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.2 },
    ];

    const snapped = snapPolygonToEdges(polygon, {
      edgeMap,
      imageWidth: width,
      imageHeight: height,
      searchRadius: 4,
    });

    expect(snapped[1].x).toBeGreaterThan(0.4);
    expect(snapped[1].x).toBeLessThan(0.7);
  });

  it('penalises candidates whose gradients align with the polygon normal', () => {
    const width = 5;
    const height = 5;
    const size = width * height;
    const magnitudes = new Float32Array(size);
    const gradientX = new Float32Array(size);
    const gradientY = new Float32Array(size);

    const index = 2 * width + 0;
    magnitudes[index] = 1;
    gradientX[index] = 1;
    gradientY[index] = 0;

    const edgeMap: EdgeMap = {
      width,
      height,
      magnitudes,
      gradientX,
      gradientY,
      maxMagnitude: 1,
    };

    const polygon = [
      { x: 0.2, y: 0.6 },
      { x: 0.2, y: 0.4 },
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.2 },
    ];

    const snapped = snapPolygonToEdges(polygon, {
      edgeMap,
      imageWidth: width,
      imageHeight: height,
      searchRadius: 4,
    });

    expect(snapped[1].x).toBeCloseTo(polygon[1].x, 1);
  });
});

