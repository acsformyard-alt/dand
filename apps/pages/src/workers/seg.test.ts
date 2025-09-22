import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearSegmentationCache,
  getSegmentationCacheStats,
  liveWirePath,
  smartWand,
  vectorizeAndSnap,
  type EntranceZone,
} from './seg';
import type { RasterImageData } from '../utils/roomToolUtils';

const createTestRaster = (width: number, height: number): RasterImageData => {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number, color: [number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = (y * width + x) * 4;
    data[offset] = color[0];
    data[offset + 1] = color[1];
    data[offset + 2] = color[2];
    data[offset + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      paint(x, y, [40, 40, 52]);
    }
  }
  // Bright room interior.
  for (let y = 6; y < height - 6; y += 1) {
    for (let x = 6; x < width - 6; x += 1) {
      paint(x, y, [210, 210, 220]);
    }
  }
  // Dark walls.
  for (let x = 4; x < width - 4; x += 1) {
    paint(x, 4, [10, 10, 20]);
    paint(x, height - 5, [10, 10, 20]);
  }
  for (let y = 4; y < height - 4; y += 1) {
    paint(4, y, [10, 10, 20]);
    paint(width - 5, y, [10, 10, 20]);
  }
  // Corridor
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < 5; x += 1) {
      paint(x, y, [200, 200, 210]);
    }
  }
  // Doorway entrance zone.
  for (let y = height / 2 - 1; y <= height / 2 + 1; y += 1) {
    paint(4, y, [180, 180, 190]);
    paint(5, y, [180, 180, 190]);
  }
  return { width, height, data };
};

const raster = createTestRaster(48, 48);

beforeEach(() => {
  clearSegmentationCache();
});

describe('segmentation worker pipeline', () => {
  it('reuses ROI preprocessing cache when the cache key matches', () => {
    const seed = { x: 0.4, y: 0.4 };
    const first = smartWand({ raster, seed, cacheKey: 'roomA', entranceZones: [], rngSeed: 42 });
    const second = smartWand({ raster, seed, cacheKey: 'roomA', entranceZones: [], rngSeed: 42 });
    expect(first.debug.cacheHit).toBe(false);
    expect(second.debug.cacheHit).toBe(true);
    const stats = getSegmentationCacheStats();
    expect(stats.entries).toBeGreaterThan(0);
    expect(stats.hits).toBeGreaterThanOrEqual(1);
  });

  it('generates a coarse-to-fine live wire path that stays within the corridor', () => {
    const start = { x: 0.05, y: 0.2 };
    const end = { x: 0.05, y: 0.8 };
    const result = liveWirePath({ raster, start, end, cacheKey: 'corridor', coarseMargin: 2 });
    expect(result.path.length).toBeGreaterThan(8);
    expect(result.debug.levelsVisited.length).toBeGreaterThan(1);
    result.path.forEach((point) => {
      expect(point.x).toBeLessThan(0.2);
    });
  });

  it('locks onto doorway entrances when configured', () => {
    const entranceZones: EntranceZone[] = [
      { id: 'door', center: { x: 6, y: raster.height / 2 }, radius: 3 },
    ];
    const result = smartWand({
      raster,
      seed: { x: 0.5, y: 0.5 },
      cacheKey: 'door-room',
      entranceZones,
      rngSeed: 7,
    });
    expect(result.entranceLocked).toBe(true);
    expect(result.lockedEntranceId).toBe('door');
    expect(result.polygon.length).toBeGreaterThan(4);
  });

  it('vectorizes and snaps a binary mask to the cost map', () => {
    const maskWidth = 24;
    const maskHeight = 24;
    const mask = new Uint8Array(maskWidth * maskHeight);
    for (let y = 4; y < maskHeight - 4; y += 1) {
      for (let x = 4; x < maskWidth - 4; x += 1) {
        mask[y * maskWidth + x] = 1;
      }
    }
    const result = vectorizeAndSnap({
      raster,
      mask,
      maskWidth,
      maskHeight,
      cacheKey: 'vector-test',
      smoothingIterations: 2,
      snapSearchRadius: 32,
    });
    expect(result.debug.cacheHit).toBe(false);
    expect(result.snappedPolygon.length).toBeGreaterThanOrEqual(4);
    const xs = result.snappedPolygon.map((p) => p.x);
    const ys = result.snappedPolygon.map((p) => p.y);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(1);
  });
});

