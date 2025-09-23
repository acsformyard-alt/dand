import { describe, expect, it } from 'vitest';
import {
  compositeMax,
  deltaEArray,
  dilateMask,
  edgeEnergyMultiScale,
  featherMask,
  fillMaskInterior,
  magicWandSelect,
  rasterizeFreehandPath,
  refineBoundaryToEdges,
  rgbToLabBatch,
  type RasterPoint,
} from '../seg';

const buildSolidImage = (width: number, height: number, color: [number, number, number]) => {
  const data = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 3] = color[0];
    data[i * 3 + 1] = color[1];
    data[i * 3 + 2] = color[2];
  }
  return data;
};

describe('color space helpers', () => {
  it('computes deltaE distances from LAB conversion', () => {
    const width = 2;
    const height = 1;
    const image = new Uint8ClampedArray([0, 0, 0, 255, 0, 0]);
    const lab = rgbToLabBatch(image, width, height);
    expect(lab).toHaveLength(6);
    const reference = { l: lab[0], a: lab[1], b: lab[2] };
    const distances = deltaEArray(lab, reference);
    expect(distances[0]).toBeCloseTo(0, 5);
    expect(distances[1]).toBeGreaterThan(50);
  });
});

describe('magic wand selection', () => {
  const width = 4;
  const height = 4;
  const buildLayer = (left: [number, number, number], right: [number, number, number]) => {
    const data = new Uint8ClampedArray(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color = x < width / 2 ? left : right;
        const index = (y * width + x) * 3;
        data[index] = color[0];
        data[index + 1] = color[1];
        data[index + 2] = color[2];
      }
    }
    return data;
  };

  it('selects contiguous region in LAB space', () => {
    const layer = buildLayer([200, 32, 32], [32, 32, 200]);
    const seed: RasterPoint = { x: 0.1, y: 0.1 };
    const mask = magicWandSelect(layer, width, height, seed, { tolerance: 18, contiguous: true });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = mask[y * width + x];
        if (x < width / 2) {
          expect(value).toBe(255);
        } else {
          expect(value).toBe(0);
        }
      }
    }
  });

  it('combines layers when sampling all layers', () => {
    const base = buildLayer([220, 40, 40], [32, 32, 200]);
    const overlay = buildLayer([210, 50, 50], [32, 200, 32]);
    const seed: RasterPoint = { x: 0.1, y: 0.5 };
    const mask = magicWandSelect([base, overlay], width, height, seed, {
      tolerance: 20,
      contiguous: false,
      sampleAllLayers: true,
    });
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = mask[y * width + x];
        if (x < width / 2) {
          expect(value).toBe(255);
        } else {
          expect(value).toBe(0);
        }
      }
    }
  });

  it('applies anti-alias falloff for boundary pixels', () => {
    const width = 3;
    const height = 1;
    const gradient = new Uint8ClampedArray([
      255, 0, 0,
      224, 16, 16,
      32, 32, 200,
    ]);
    const mask = magicWandSelect(gradient, width, height, { x: 0, y: 0 }, {
      tolerance: 12,
      contiguous: false,
      antiAlias: true,
      antiAliasFalloff: 12,
    });
    expect(mask[0]).toBe(255);
    expect(mask[2]).toBe(0);
    expect(mask[1]).toBeGreaterThan(0);
    expect(mask[1]).toBeLessThan(255);
  });
});

describe('edge energy detection', () => {
  it('highlights boundaries across scales', () => {
    const width = 8;
    const height = 8;
    const image = buildSolidImage(width, height, [12, 12, 12]);
    for (let y = 0; y < height; y += 1) {
      const index = (y * width + Math.floor(width / 2)) * 3;
      image[index] = 240;
      image[index + 1] = 240;
      image[index + 2] = 240;
    }
    const energy = edgeEnergyMultiScale(image, width, height, { scales: 3, baseSigma: 0.7 });
    expect(energy.length).toBe(width * height);
    const centerColumn = Math.floor(width / 2);
    for (let y = 0; y < height; y += 1) {
      const leftEdge = energy[y * width + Math.max(0, centerColumn - 1)];
      const rightEdge = energy[y * width + Math.min(width - 1, centerColumn + 1)];
      const background = energy[y * width + 0];
      expect(Math.max(leftEdge, rightEdge)).toBeGreaterThan(background);
      expect(Math.max(leftEdge, rightEdge)).toBeGreaterThan(0.3);
    }
  });
});

describe('mask raster helpers', () => {
  const width = 32;
  const height = 32;
  const square: RasterPoint[] = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ];

  it('fills interior of rasterized freehand path', () => {
    const boundary = rasterizeFreehandPath(square, width, height, { strokeRadius: 0.01 });
    expect(boundary.some((value) => value === 255)).toBe(true);
    const filled = fillMaskInterior(boundary, width, height);
    const interiorIndex = Math.floor(height / 2) * width + Math.floor(width / 2);
    expect(boundary[interiorIndex]).toBe(0);
    expect(filled[interiorIndex]).toBe(255);
  });

  it('dilates and feathers masks', () => {
    const mask = new Uint8ClampedArray(width * height);
    const centerIndex = Math.floor(height / 2) * width + Math.floor(width / 2);
    mask[centerIndex] = 255;
    const dilated = dilateMask(mask, width, height, 3);
    const feathered = featherMask(dilated, width, height, 3);
    expect(dilated[centerIndex]).toBe(255);
    const ringIndex = centerIndex + 3;
    expect(dilated[ringIndex]).toBe(255);
    expect(feathered[ringIndex]).toBeLessThan(255);
    expect(feathered[ringIndex]).toBeGreaterThan(0);
  });

  it('composites masks by maximum value', () => {
    const a = new Uint8ClampedArray(width * height);
    const b = new Uint8ClampedArray(width * height);
    a[10 * width + 10] = 120;
    b[10 * width + 10] = 200;
    b[5 * width + 5] = 220;
    const result = compositeMax([a, b], width, height);
    expect(result[10 * width + 10]).toBe(200);
    expect(result[5 * width + 5]).toBe(220);
  });
});

describe('boundary refinement', () => {
  it('stops expansion at strong energy ridges within band', () => {
    const width = 16;
    const height = 8;
    const initial = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x <= 4; x += 1) {
        initial[y * width + x] = 255;
      }
    }
    const energy = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      energy[y * width + 6] = 1;
    }
    const refined = refineBoundaryToEdges(initial, width, height, energy, {
      bandSize: 6,
      edgeThreshold: 0.4,
      connectivity: 8,
    });
    for (let y = 0; y < height; y += 1) {
      expect(refined[y * width + 6]).toBe(255);
      expect(refined[y * width + 7]).toBe(0);
    }
  });
});
