import { describe, expect, it } from 'vitest';
import type { EdgeMap } from './imageProcessing';
import {
  applyBrushToMask,
  dilateMask,
  extractLargestPolygonFromMask,
  floodFillRoomMask,
  type RasterImageData,
} from './roomToolUtils';

describe('roomToolUtils', () => {
  it('converts a brushed mask into a polygon', () => {
    const width = 16;
    const height = 16;
    const mask = new Uint8Array(width * height);
    applyBrushToMask(mask, width, height, 8, 8, 3);
    const dilated = dilateMask(mask, width, height, 2);
    const polygon = extractLargestPolygonFromMask(dilated, width, height);
    expect(polygon.length).toBeGreaterThanOrEqual(4);
    polygon.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    });
  });

  it('supports erasing pixels from an existing mask', () => {
    const width = 12;
    const height = 12;
    const mask = new Uint8Array(width * height);
    applyBrushToMask(mask, width, height, 6, 6, 3, 'add');
    let filled = 0;
    mask.forEach((value) => {
      if (value) filled += 1;
    });
    expect(filled).toBeGreaterThan(0);
    applyBrushToMask(mask, width, height, 6, 6, 2, 'erase');
    const remaining = mask.reduce((count, value) => count + value, 0);
    expect(remaining).toBeLessThan(filled);
  });

  it('extracts the dominant region when multiple polygons exist', () => {
    const width = 8;
    const height = 8;
    const mask = new Uint8Array(width * height);
    // Fill two regions, one larger than the other.
    for (let y = 1; y <= 5; y += 1) {
      for (let x = 1; x <= 4; x += 1) {
        mask[y * width + x] = 1;
      }
    }
    for (let y = 6; y < height; y += 1) {
      for (let x = 6; x < width; x += 1) {
        mask[y * width + x] = 1;
      }
    }
    const polygon = extractLargestPolygonFromMask(mask, width, height);
    expect(polygon.length).toBeGreaterThan(0);
    const area = polygon.reduce((acc, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return acc + point.x * next.y - next.x * point.y;
    }, 0);
    expect(Math.abs(area)).toBeGreaterThan(0.01);
  });

  it('performs a flood fill that respects edge map gradients', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const value = x < 2 ? 40 : 180;
        data[offset] = value;
        data[offset + 1] = value;
        data[offset + 2] = value;
        data[offset + 3] = 255;
      }
    }
    const raster: RasterImageData = { width, height, data };
    const magnitudes = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const wallIndex = y * width + 2;
      magnitudes[wallIndex] = 1;
    }
    const edgeMap: EdgeMap = {
      width,
      height,
      magnitudes,
      gradientX: new Float32Array(width * height),
      gradientY: new Float32Array(width * height),
      maxMagnitude: 1,
    };
    const result = floodFillRoomMask(raster, edgeMap, 0, 0, {
      colorTolerance: 30,
      gradientThreshold: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.count).toBe(8);
    const polygon = extractLargestPolygonFromMask(result!.mask, width, height);
    expect(polygon.length).toBeGreaterThanOrEqual(4);
  });
});
