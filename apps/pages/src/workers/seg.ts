import type { Bounds } from '../../types/geometry';

export interface RasterPoint {
  x: number;
  y: number;
}

export interface MagicWandOptions {
  tolerance?: number;
  contiguous?: boolean;
  sampleAllLayers?: boolean;
  antiAlias?: boolean;
  antiAliasFalloff?: number;
  connectivity?: 4 | 8;
}

export interface EdgeEnergyOptions {
  scales?: number;
  baseSigma?: number;
}

export interface BoundaryRefinementOptions {
  bandSize?: number;
  edgeThreshold?: number;
  connectivity?: 4 | 8;
}

export interface RasterizeFreehandOptions {
  strokeRadius?: number;
  closePath?: boolean;
}

export type RasterLayer = Uint8ClampedArray | Uint8Array | Float32Array;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const clamp01 = (value: number) => clamp(value, 0, 1);

const srgbToLinear = (value: number) => {
  const v = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return v;
};

const linearToXyz = (r: number, g: number, b: number) => ({
  x: r * 0.4123907992659595 + g * 0.357584339383878 + b * 0.1804807884018343,
  y: r * 0.21263900587151036 + g * 0.715168678767756 + b * 0.07219231536073371,
  z: r * 0.01933081871559182 + g * 0.11919477979462598 + b * 0.9505321522496607,
});

const xyzToLab = (x: number, y: number, z: number) => {
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  const pivot = (value: number) => {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
  };
  const fx = pivot(x / xn);
  const fy = pivot(y / yn);
  const fz = pivot(z / zn);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
};

export const rgbToLabBatch = (source: RasterLayer, width: number, height: number): Float32Array => {
  const pixelCount = width * height;
  if (!pixelCount) {
    return new Float32Array(0);
  }
  const stride = Math.floor(source.length / pixelCount);
  if (stride < 3) {
    throw new Error('Source image must contain at least three channels per pixel');
  }
  const lab = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * stride;
    const r = clamp(source[base] ?? 0, 0, 255) / 255;
    const g = clamp(source[base + 1] ?? source[base] ?? 0, 0, 255) / 255;
    const b = clamp(source[base + 2] ?? source[base] ?? 0, 0, 255) / 255;
    const lr = srgbToLinear(r);
    const lg = srgbToLinear(g);
    const lb = srgbToLinear(b);
    const xyz = linearToXyz(lr, lg, lb);
    const labColor = xyzToLab(xyz.x, xyz.y, xyz.z);
    lab[i * 3] = labColor.l;
    lab[i * 3 + 1] = labColor.a;
    lab[i * 3 + 2] = labColor.b;
  }
  return lab;
};

const deltaE1976 = (
  labA: { l: number; a: number; b: number },
  labB: { l: number; a: number; b: number }
) => {
  const dl = labA.l - labB.l;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Math.sqrt(dl * dl + da * da + db * db);
};

export const deltaEArray = (
  labPixels: Float32Array,
  reference: { l: number; a: number; b: number },
  output?: Float32Array
): Float32Array => {
  if (labPixels.length % 3 !== 0) {
    throw new Error('LAB pixel buffer must be divisible by 3');
  }
  const pixelCount = labPixels.length / 3;
  const result = output ?? new Float32Array(pixelCount);
  if (result.length !== pixelCount) {
    throw new Error('Output buffer length mismatch');
  }
  for (let i = 0; i < pixelCount; i += 1) {
    const l = labPixels[i * 3];
    const a = labPixels[i * 3 + 1];
    const b = labPixels[i * 3 + 2];
    result[i] = deltaE1976({ l, a, b }, reference);
  }
  return result;
};

const toGrayscale = (source: RasterLayer, width: number, height: number): Float32Array => {
  const pixelCount = width * height;
  const stride = Math.floor(source.length / Math.max(pixelCount, 1)) || 1;
  const grayscale = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const base = i * stride;
    const r = source[base] ?? 0;
    const g = source[base + 1] ?? r;
    const b = source[base + 2] ?? r;
    grayscale[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return grayscale;
};

const buildGaussianKernel = (sigma: number) => {
  const clampedSigma = Math.max(0.25, sigma);
  const radius = Math.max(1, Math.ceil(clampedSigma * 3));
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const twoSigmaSq = 2 * clampedSigma * clampedSigma;
  let sum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const value = Math.exp(-(i * i) / twoSigmaSq);
    kernel[i + radius] = value;
    sum += value;
  }
  for (let i = 0; i < size; i += 1) {
    kernel[i] /= sum;
  }
  return { kernel, radius };
};

const gaussianBlur = (
  source: Float32Array,
  width: number,
  height: number,
  sigma: number
): Float32Array => {
  if (sigma <= 0) {
    return source.slice();
  }
  const { kernel, radius } = buildGaussianKernel(sigma);
  const pixelCount = width * height;
  const horizontal = new Float32Array(pixelCount);
  const output = new Float32Array(pixelCount);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleX = clamp(x + k, 0, width - 1);
        value += source[y * width + sampleX] * kernel[k + radius];
      }
      horizontal[y * width + x] = value;
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let value = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleY = clamp(y + k, 0, height - 1);
        value += horizontal[sampleY * width + x] * kernel[k + radius];
      }
      output[y * width + x] = value;
    }
  }

  return output;
};

const computeGradientMagnitude = (field: Float32Array, width: number, height: number) => {
  const gradient = new Float32Array(field.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const left = field[y * width + clamp(x - 1, 0, width - 1)];
      const right = field[y * width + clamp(x + 1, 0, width - 1)];
      const top = field[clamp(y - 1, 0, height - 1) * width + x];
      const bottom = field[clamp(y + 1, 0, height - 1) * width + x];
      const dx = (right - left) * 0.5;
      const dy = (bottom - top) * 0.5;
      gradient[index] = Math.hypot(dx, dy);
    }
  }
  return gradient;
};

export const edgeEnergyMultiScale = (
  source: RasterLayer,
  width: number,
  height: number,
  options?: EdgeEnergyOptions
): Float32Array => {
  const scales = Math.max(1, Math.round(options?.scales ?? 3));
  const baseSigma = clamp(options?.baseSigma ?? 0.8, 0.25, 4);
  const grayscale = toGrayscale(source, width, height);
  const accum = new Float32Array(grayscale.length);
  let maxEnergy = 0;

  for (let level = 0; level < scales; level += 1) {
    const sigma = baseSigma * (level + 1);
    const smoothed = gaussianBlur(grayscale, width, height, sigma);
    const gradient = computeGradientMagnitude(smoothed, width, height);
    for (let i = 0; i < gradient.length; i += 1) {
      if (gradient[i] > accum[i]) {
        accum[i] = gradient[i];
      }
      if (accum[i] > maxEnergy) {
        maxEnergy = accum[i];
      }
    }
  }

  if (maxEnergy > 0) {
    const invMax = 1 / maxEnergy;
    for (let i = 0; i < accum.length; i += 1) {
      accum[i] = clamp01(accum[i] * invMax);
    }
  }

  return accum;
};

const pointToPixel = (point: RasterPoint, width: number, height: number) => ({
  x: clamp(Math.round(point.x * (width - 1)), 0, width - 1),
  y: clamp(Math.round(point.y * (height - 1)), 0, height - 1),
});

const ensureLayerArray = (source: RasterLayer | RasterLayer[]) =>
  Array.isArray(source) ? source : [source];

const neighborOffsets = (width: number, connectivity: 4 | 8) =>
  connectivity === 8
    ? [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]
    : [-width, -1, 1, width];

export const magicWandSelect = (
  source: RasterLayer | RasterLayer[],
  width: number,
  height: number,
  seed: RasterPoint,
  options?: MagicWandOptions
): Uint8ClampedArray => {
  const pixelCount = width * height;
  if (!pixelCount) {
    return new Uint8ClampedArray(0);
  }

  const layers = ensureLayerArray(source);
  const labLayers = layers.map((layer) => rgbToLabBatch(layer, width, height));

  const seedPixel = pointToPixel(seed, width, height);
  const seedIndex = seedPixel.y * width + seedPixel.x;
  const tolerance = Math.max(options?.tolerance ?? 16, 0.1);
  const contiguous = options?.contiguous ?? true;
  const sampleAll = options?.sampleAllLayers ?? false;
  const antiAlias = options?.antiAlias ?? false;
  const falloff = Math.max(options?.antiAliasFalloff ?? tolerance * 0.35, 0.001);
  const connectivity: 4 | 8 = options?.connectivity === 4 ? 4 : 8;

  const seedLabs = labLayers.map((layer) => ({
    l: layer[seedIndex * 3],
    a: layer[seedIndex * 3 + 1],
    b: layer[seedIndex * 3 + 2],
  }));

  const pixelCountFloat = new Float32Array(pixelCount);
  const distances = new Float32Array(pixelCount);
  for (let layerIndex = 0; layerIndex < labLayers.length; layerIndex += 1) {
    const layerDistances = deltaEArray(labLayers[layerIndex], seedLabs[layerIndex], pixelCountFloat);
    if (layerIndex === 0) {
      distances.set(layerDistances);
    } else if (sampleAll) {
      for (let i = 0; i < pixelCount; i += 1) {
        distances[i] += layerDistances[i];
      }
    } else {
      break;
    }
  }

  if (sampleAll && labLayers.length > 1) {
    const inv = 1 / labLayers.length;
    for (let i = 0; i < pixelCount; i += 1) {
      distances[i] *= inv;
    }
  }

  const effectiveTolerance = Math.max(tolerance, distances[seedIndex]);
  const maskValues = new Float32Array(pixelCount);

  if (!contiguous) {
    for (let i = 0; i < pixelCount; i += 1) {
      const distance = distances[i];
      if (distance <= effectiveTolerance) {
        maskValues[i] = 1;
      } else if (antiAlias && distance <= effectiveTolerance + falloff) {
        maskValues[i] = Math.max(maskValues[i], clamp01(1 - (distance - effectiveTolerance) / falloff));
      }
    }
  } else {
    const visited = new Uint8Array(pixelCount);
    const queue = new Uint32Array(pixelCount);
    let head = 0;
    let tail = 0;

    if (distances[seedIndex] <= effectiveTolerance + falloff) {
      queue[tail++] = seedIndex;
      visited[seedIndex] = 1;
      maskValues[seedIndex] = 1;
    } else {
      maskValues[seedIndex] = 1;
    }

    const offsets = neighborOffsets(width, connectivity);

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      for (const offset of offsets) {
        const neighbor = index + offset;
        if (neighbor < 0 || neighbor >= pixelCount) {
          continue;
        }
        const nx = neighbor % width;
        const ny = Math.floor(neighbor / width);
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) {
          continue;
        }
        if (visited[neighbor]) {
          continue;
        }
        visited[neighbor] = 1;
        const distance = distances[neighbor];
        if (distance <= effectiveTolerance) {
          maskValues[neighbor] = 1;
          queue[tail++] = neighbor;
        } else if (antiAlias && distance <= effectiveTolerance + falloff) {
          maskValues[neighbor] = Math.max(maskValues[neighbor], clamp01(1 - (distance - effectiveTolerance) / falloff));
        }
      }
    }

    if (antiAlias) {
      const offsets = neighborOffsets(width, connectivity);
      for (let index = 0; index < pixelCount; index += 1) {
        if (maskValues[index] < 1) {
          continue;
        }
        const x = index % width;
        const y = Math.floor(index / width);
        for (const offset of offsets) {
          const neighbor = index + offset;
          if (neighbor < 0 || neighbor >= pixelCount) {
            continue;
          }
          const nx = neighbor % width;
          const ny = Math.floor(neighbor / width);
          if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) {
            continue;
          }
          if (maskValues[neighbor] >= 1) {
            continue;
          }
          const distance = distances[neighbor];
          if (distance <= effectiveTolerance + falloff) {
            maskValues[neighbor] = Math.max(
              maskValues[neighbor],
              clamp01(1 - (distance - effectiveTolerance) / falloff)
            );
          }
        }
      }
    }
  }

  const mask = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    mask[i] = Math.round(clamp01(maskValues[i]) * 255);
  }
  return mask;
};
const drawDisc = (
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
) => {
  const radiusSq = radius * radius;
  const minX = clamp(Math.floor(cx - radius), 0, width - 1);
  const maxX = clamp(Math.ceil(cx + radius), 0, width - 1);
  const minY = clamp(Math.floor(cy - radius), 0, height - 1);
  const maxY = clamp(Math.ceil(cy + radius), 0, height - 1);
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= radiusSq) {
        mask[y * width + x] = 255;
      }
    }
  }
};

export const rasterizeFreehandPath = (
  points: RasterPoint[],
  width: number,
  height: number,
  options?: RasterizeFreehandOptions
): Uint8ClampedArray => {
  const mask = new Uint8ClampedArray(width * height);
  if (points.length === 0) {
    return mask;
  }
  const radius = Math.max(options?.strokeRadius ?? 0.004, 0) * Math.max(width, height);
  const closePath = options?.closePath ?? true;

  const pixels = points.map((point) => pointToPixel(point, width, height));
  const segments = closePath && pixels.length > 1 ? pixels.concat([pixels[0]]) : pixels;

  for (let i = 1; i < segments.length; i += 1) {
    const start = segments[i - 1];
    const end = segments[i];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) + 1;
    for (let step = 0; step <= steps; step += 1) {
      const t = steps === 0 ? 0 : step / steps;
      const x = start.x + dx * t;
      const y = start.y + dy * t;
      drawDisc(mask, width, height, x, y, Math.max(radius, 0.5));
    }
  }

  if (segments.length === 1) {
    const point = segments[0];
    drawDisc(mask, width, height, point.x, point.y, Math.max(radius, 0.5));
  }

  return mask;
};

const floodFillExterior = (mask: Uint8ClampedArray, width: number, height: number) => {
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let head = 0;
  let tail = 0;

  const push = (index: number) => {
    visited[index] = 1;
    queue[tail++] = index;
  };

  for (let x = 0; x < width; x += 1) {
    const topIndex = x;
    const bottomIndex = (height - 1) * width + x;
    if (mask[topIndex] === 0 && !visited[topIndex]) push(topIndex);
    if (mask[bottomIndex] === 0 && !visited[bottomIndex]) push(bottomIndex);
  }
  for (let y = 0; y < height; y += 1) {
    const leftIndex = y * width;
    const rightIndex = y * width + (width - 1);
    if (mask[leftIndex] === 0 && !visited[leftIndex]) push(leftIndex);
    if (mask[rightIndex] === 0 && !visited[rightIndex]) push(rightIndex);
  }

  const offsets = [-width, 1, width, -1];

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const offset of offsets) {
      const neighbor = index + offset;
      if (neighbor < 0 || neighbor >= pixelCount) {
        continue;
      }
      const nx = neighbor % width;
      const ny = Math.floor(neighbor / width);
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) {
        continue;
      }
      if (visited[neighbor] || mask[neighbor] !== 0) {
        continue;
      }
      push(neighbor);
    }
  }

  return visited;
};

export const fillMaskInterior = (
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  bounds?: Bounds
): Uint8ClampedArray => {
  const pixelCount = width * height;
  if (!pixelCount) {
    return new Uint8ClampedArray(0);
  }
  const filled = new Uint8ClampedArray(mask);
  const exterior = floodFillExterior(filled, width, height);

  for (let i = 0; i < pixelCount; i += 1) {
    if (filled[i] > 0) {
      filled[i] = 255;
    } else if (!exterior[i]) {
      filled[i] = 255;
    } else {
      filled[i] = 0;
    }
  }

  if (bounds) {
    const minX = clamp(Math.floor(bounds.minX * width), 0, width - 1);
    const maxX = clamp(Math.ceil(bounds.maxX * width), 0, width - 1);
    const minY = clamp(Math.floor(bounds.minY * height), 0, height - 1);
    const maxY = clamp(Math.ceil(bounds.maxY * height), 0, height - 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x < minX || x > maxX || y < minY || y > maxY) {
          filled[y * width + x] = 0;
        }
      }
    }
  }

  return filled;
};

export const dilateMask = (
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 1
): Uint8ClampedArray => {
  const pixelCount = width * height;
  if (!pixelCount) {
    return new Uint8ClampedArray(0);
  }
  const input = new Uint8ClampedArray(mask);
  const result = new Uint8ClampedArray(pixelCount);
  const r = Math.max(0, Math.floor(radius));
  const radiusSq = r * r;
  if (r === 0) {
    return input;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (input[index] === 0) {
        continue;
      }
      const minX = clamp(x - r, 0, width - 1);
      const maxX = clamp(x + r, 0, width - 1);
      const minY = clamp(y - r, 0, height - 1);
      const maxY = clamp(y + r, 0, height - 1);
      for (let ny = minY; ny <= maxY; ny += 1) {
        for (let nx = minX; nx <= maxX; nx += 1) {
          const dx = nx - x;
          const dy = ny - y;
          if (dx * dx + dy * dy <= radiusSq) {
            result[ny * width + nx] = 255;
          }
        }
      }
    }
  }
  return result;
};

export const featherMask = (
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 2
): Uint8ClampedArray => {
  const pixelCount = width * height;
  if (!pixelCount) {
    return new Uint8ClampedArray(0);
  }
  if (radius <= 0) {
    return new Uint8ClampedArray(mask);
  }
  const input = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    input[i] = clamp01(mask[i] / 255);
  }
  const sigma = Math.max(radius * 0.5, 0.25);
  const blurred = gaussianBlur(input, width, height, sigma);
  const output = new Uint8ClampedArray(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    output[i] = Math.round(clamp01(blurred[i]) * 255);
  }
  return output;
};

export const compositeMax = (
  masks: ArrayLike<Uint8ClampedArray>,
  width: number,
  height: number
): Uint8ClampedArray => {
  const pixelCount = width * height;
  const result = new Uint8ClampedArray(pixelCount);
  for (let index = 0; index < masks.length; index += 1) {
    const mask = masks[index];
    if (mask.length !== pixelCount) {
      throw new Error('Mask dimensions do not match for composite');
    }
    for (let i = 0; i < pixelCount; i += 1) {
      if (mask[i] > result[i]) {
        result[i] = mask[i];
      }
    }
  }
  return result;
};

const erodeMask = (mask: Uint8ClampedArray, width: number, height: number, radius = 1) => {
  const pixelCount = width * height;
  const result = new Uint8ClampedArray(pixelCount);
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) {
    return new Uint8ClampedArray(mask);
  }
  const radiusSq = r * r;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = true;
      const minX = clamp(x - r, 0, width - 1);
      const maxX = clamp(x + r, 0, width - 1);
      const minY = clamp(y - r, 0, height - 1);
      const maxY = clamp(y + r, 0, height - 1);
      for (let ny = minY; ny <= maxY && keep; ny += 1) {
        for (let nx = minX; nx <= maxX; nx += 1) {
          const dx = nx - x;
          const dy = ny - y;
          if (dx * dx + dy * dy > radiusSq) {
            continue;
          }
          if (mask[ny * width + nx] === 0) {
            keep = false;
            break;
          }
        }
      }
      if (keep) {
        result[y * width + x] = 255;
      }
    }
  }
  return result;
};

export const refineBoundaryToEdges = (
  initialMask: Uint8ClampedArray,
  width: number,
  height: number,
  energy: Float32Array,
  options?: BoundaryRefinementOptions
): Uint8ClampedArray => {
  const pixelCount = width * height;
  if (!pixelCount || energy.length !== pixelCount) {
    return new Uint8ClampedArray(pixelCount);
  }
  const filled = fillMaskInterior(initialMask, width, height);
  const bandSize = Math.max(1, Math.round(options?.bandSize ?? 8));
  const allowed = dilateMask(filled, width, height, bandSize);
  const interiorSeeds = erodeMask(filled, width, height, 1);
  const visited = new Uint8Array(pixelCount);
  const result = new Uint8ClampedArray(pixelCount);
  const queue = new Uint32Array(pixelCount);
  const offsets = neighborOffsets(width, options?.connectivity === 4 ? 4 : 8);
  const threshold = clamp01(options?.edgeThreshold ?? 0.35);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    if (interiorSeeds[i] > 0) {
      visited[i] = 1;
      result[i] = 255;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = Math.floor(index / width);
    for (const offset of offsets) {
      const neighbor = index + offset;
      if (neighbor < 0 || neighbor >= pixelCount) {
        continue;
      }
      const nx = neighbor % width;
      const ny = Math.floor(neighbor / width);
      if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) {
        continue;
      }
      if (visited[neighbor] || allowed[neighbor] === 0) {
        continue;
      }
      visited[neighbor] = 1;
      if (energy[neighbor] >= threshold) {
        result[neighbor] = 255;
      } else {
        result[neighbor] = 255;
        queue[tail++] = neighbor;
      }
    }
  }

  return fillMaskInterior(result, width, height);
};

export type SegmentationWorker = {
  magicWandSelect: typeof magicWandSelect;
  refineBoundaryToEdges: typeof refineBoundaryToEdges;
  edgeEnergyMultiScale: typeof edgeEnergyMultiScale;
  rasterizeFreehandPath: typeof rasterizeFreehandPath;
  fillMaskInterior: typeof fillMaskInterior;
  dilateMask: typeof dilateMask;
  featherMask: typeof featherMask;
  compositeMax: typeof compositeMax;
};
