import { describe, expect, it, beforeEach } from 'vitest';
import { MagneticLassoTool } from './magneticLasso';
import { selectionStore } from '../state/selection';
import type { RasterImageData } from '../utils/roomToolUtils';

const createRaster = (): RasterImageData => {
  const width = 32;
  const height = 32;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = x > 8 && x < 24 && y > 8 && y < 24 ? 200 : 32;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
};

beforeEach(() => {
  selectionStore.clearSelection();
});

describe('MagneticLassoTool', () => {
  it('throttles live preview requests when the pointer barely moves', () => {
    const tool = new MagneticLassoTool({ raster: createRaster() });
    tool.pointerDown({ x: 0.4, y: 0.4 });
    tool.pointerMove({ x: 0.6, y: 0.4 });
    const firstOverlay = tool.getDebugOverlay();
    tool.pointerMove({ x: 0.6001, y: 0.4 });
    const secondOverlay = tool.getDebugOverlay();
    expect(secondOverlay.previewComputations).toBe(firstOverlay.previewComputations);
  });

  it('commits anchors and updates the selection store on finalize', () => {
    const tool = new MagneticLassoTool({ raster: createRaster(), cacheKey: 'lasso' });
    tool.pointerDown({ x: 0.35, y: 0.35 });
    tool.pointerDown({ x: 0.65, y: 0.35 });
    tool.pointerDown({ x: 0.65, y: 0.65 });
    tool.pointerDown({ x: 0.35, y: 0.65 });
    const result = tool.finalize({ smoothingIterations: 1 });
    expect(result).not.toBeNull();
    const state = selectionStore.getState();
    expect(state.tool).toBe('magneticLasso');
    expect(state.polygon).not.toBeNull();
    expect(state.entranceLocked).toBe(false);
  });
});

