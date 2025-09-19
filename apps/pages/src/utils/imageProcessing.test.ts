import { describe, expect, it } from 'vitest';
import { buildEdgeMap, computeDisplayMetrics, snapPolygonToEdges } from './imageProcessing';

describe('computeDisplayMetrics', () => {
  it('returns centered display metrics for letterboxed images', () => {
    const metrics = computeDisplayMetrics(800, 600, 1600, 800);
    expect(metrics.displayWidth).toBeCloseTo(800);
    expect(metrics.displayHeight).toBeCloseTo(400);
    expect(metrics.offsetX).toBeCloseTo(0);
    expect(metrics.offsetY).toBeCloseTo(100);
  });
});

describe('snapPolygonToEdges', () => {
  it('aligns polygon vertices to the strongest nearby edge', () => {
    const width = 8;
    const height = 8;
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

    const polygon = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 },
    ];

    const snapped = snapPolygonToEdges(polygon, {
      edgeMap,
      imageWidth: width,
      imageHeight: height,
      searchRadius: 4,
    });

    snapped.forEach((point, index) => {
      const original = polygon[index];
      expect(point.x).toBeGreaterThan(0.45);
      expect(point.x).toBeLessThan(0.55);
      expect(point.y).toBeCloseTo(original.y, 1);
    });
  });
});

