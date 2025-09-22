import { describe, expect, it, beforeEach } from 'vitest';
import { SmartWandTool } from './smartWand';
import { selectionStore } from '../state/selection';
import type { RasterImageData } from '../utils/roomToolUtils';

const createRaster = (): RasterImageData => {
  const width = 40;
  const height = 40;
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x: number, y: number, value: number) => {
    const offset = (y * width + x) * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bright = x > 6 && x < 34 && y > 6 && y < 34;
      paint(x, y, bright ? 210 : 28);
    }
  }
  for (let y = 18; y <= 22; y += 1) {
    paint(6, y, 180);
    paint(7, y, 180);
  }
  return { width, height, data };
};

beforeEach(() => {
  selectionStore.clearSelection();
});

describe('SmartWandTool', () => {
  it('captures a region and records entrance locking state', () => {
    const raster = createRaster();
    const tool = new SmartWandTool({
      raster,
      cacheKey: 'wand-test',
      entranceZones: [{ id: 'door', center: { x: 6, y: 20 }, radius: 3 }],
      rngSeed: 21,
    });
    const result = tool.select({ x: 0.5, y: 0.5 });
    expect(result).not.toBeNull();
    expect(result?.entranceLocked).toBe(true);
    expect(result?.lockedEntranceId).toBe('door');
    const state = selectionStore.getState();
    expect(state.tool).toBe('smartWand');
    expect(state.entranceLocked).toBe(true);
    expect(state.lockedEntranceId).toBe('door');
  });

  it('clears the selection state when requested', () => {
    const raster = createRaster();
    const tool = new SmartWandTool({ raster });
    tool.select({ x: 0.5, y: 0.5 });
    tool.clearSelection();
    const state = selectionStore.getState();
    expect(state.polygon).toBeNull();
    expect(state.tool).toBeNull();
  });
});

