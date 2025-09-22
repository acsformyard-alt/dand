import { buildEdgeMap, snapPolygonToEdges, smoothPolygon, type EdgeMap } from '../utils/imageProcessing';
import { extractLargestPolygonFromMask, type RasterImageData } from '../utils/roomToolUtils';

export interface ROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreprocessConfig {
  claheTileSize?: number;
  claheClipLimit?: number;
  denoiseKernelRadius?: number;
  denoiseSigma?: number;
  pyramidLevels?: number;
}

export interface EntranceZone {
  id: string;
  center: { x: number; y: number };
  radius: number;
}

interface CostLevel {
  width: number;
  height: number;
  data: Float32Array;
  scale: number;
}

interface GridModel {
  width: number;
  height: number;
  costs: Float32Array;
  maxCost: number;
}

interface CachedPreprocess {
  key: string;
  roi: ROI | null;
  originX: number;
  originY: number;
  width: number;
  height: number;
  grayscale: Float32Array;
  clahe: Float32Array;
  denoised: Float32Array;
  edgeMap: EdgeMap;
  costLevels: CostLevel[];
  gridModel: GridModel;
  stats: {
    createdAt: number;
    lastUsed: number;
    hits: number;
  };
}

interface PreprocessRequest {
  raster: RasterImageData;
  roi?: ROI | null;
  cacheKey?: string;
  config?: PreprocessConfig;
}

const DEFAULT_CONFIG: Required<PreprocessConfig> = {
  claheTileSize: 32,
  claheClipLimit: 0.015,
  denoiseKernelRadius: 1,
  denoiseSigma: 1.2,
  pyramidLevels: 5,
};

const roiCache = new Map<string, CachedPreprocess>();
let cacheHits = 0;
let cacheMisses = 0;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hashRasterRegion = (raster: RasterImageData, roi: ROI | null) => {
  const { width, height, data } = raster;
  const region = roi ?? { x: 0, y: 0, width, height };
  let hash = 0;
  const stepX = Math.max(1, Math.floor(region.width / 8));
  const stepY = Math.max(1, Math.floor(region.height / 8));
  for (let y = region.y; y < region.y + region.height; y += stepY) {
    for (let x = region.x; x < region.x + region.width; x += stepX) {
      const index = (y * width + x) * 4;
      hash = (hash * 16777619) ^ data[index];
      hash = (hash * 16777619) ^ data[index + 1];
      hash = (hash * 16777619) ^ data[index + 2];
    }
  }
  return `${region.x}:${region.y}:${region.width}:${region.height}:${hash >>> 0}`;
};

const getCacheKey = (request: PreprocessRequest) => {
  if (request.cacheKey) {
    return request.cacheKey;
  }
  return hashRasterRegion(request.raster, request.roi ?? null);
};

const extractRoi = (raster: RasterImageData, roi: ROI | null) => {
  const { width, height, data } = raster;
  if (!roi) {
    return {
      width,
      height,
      originX: 0,
      originY: 0,
      data: new Uint8ClampedArray(data),
    };
  }
  const rx = clamp(Math.floor(roi.x), 0, width - 1);
  const ry = clamp(Math.floor(roi.y), 0, height - 1);
  const rw = clamp(Math.floor(roi.width), 1, width - rx);
  const rh = clamp(Math.floor(roi.height), 1, height - ry);
  const result = new Uint8ClampedArray(rw * rh * 4);
  for (let y = 0; y < rh; y += 1) {
    for (let x = 0; x < rw; x += 1) {
      const sourceIndex = ((ry + y) * width + (rx + x)) * 4;
      const targetIndex = (y * rw + x) * 4;
      result[targetIndex] = data[sourceIndex];
      result[targetIndex + 1] = data[sourceIndex + 1];
      result[targetIndex + 2] = data[sourceIndex + 2];
      result[targetIndex + 3] = data[sourceIndex + 3];
    }
  }
  return { width: rw, height: rh, originX: rx, originY: ry, data: result };
};

const toGrayscale = (data: Uint8ClampedArray) => {
  const grayscale = new Float32Array(data.length / 4);
  for (let index = 0; index < grayscale.length; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    grayscale[index] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return grayscale;
};

const applyClahe = (
  input: Float32Array,
  width: number,
  height: number,
  config: Required<PreprocessConfig>
) => {
  const tileSize = Math.max(4, Math.floor(config.claheTileSize));
  const clip = clamp(config.claheClipLimit, 0, 0.25);
  const half = Math.max(1, Math.floor(tileSize / 2));
  const output = new Float32Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let min = Infinity;
      let max = -Infinity;
      for (let ky = -half; ky <= half; ky += 1) {
        const sampleY = clamp(y + ky, 0, height - 1);
        for (let kx = -half; kx <= half; kx += 1) {
          const sampleX = clamp(x + kx, 0, width - 1);
          const value = input[sampleY * width + sampleX];
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      const value = input[y * width + x];
      const normalized = max > min ? (value - min) / (max - min) : 0;
      const clipped = clamp(normalized, clip, 1 - clip);
      const expanded = (clipped - clip) / Math.max(1 - clip * 2, 1e-6);
      output[y * width + x] = clamp(expanded * 255, 0, 255);
    }
  }
  return output;
};

const buildGaussianKernel = (radius: number, sigma: number) => {
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size * size);
  const sigmaSq = sigma * sigma;
  let sum = 0;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const weight = Math.exp(-(x * x + y * y) / (2 * sigmaSq));
      const index = (y + radius) * size + (x + radius);
      kernel[index] = weight;
      sum += weight;
    }
  }
  for (let index = 0; index < kernel.length; index += 1) {
    kernel[index] /= sum || 1;
  }
  return { kernel, size };
};

const applyDenoise = (
  input: Float32Array,
  width: number,
  height: number,
  config: Required<PreprocessConfig>
) => {
  const radius = clamp(Math.floor(config.denoiseKernelRadius), 0, 4);
  if (radius === 0) {
    return new Float32Array(input);
  }
  const sigma = config.denoiseSigma;
  const { kernel, size } = buildGaussianKernel(radius, sigma);
  const output = new Float32Array(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let weightSum = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        const sampleY = clamp(y + ky, 0, height - 1);
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sampleX = clamp(x + kx, 0, width - 1);
          const weight = kernel[(ky + radius) * size + (kx + radius)];
          sum += input[sampleY * width + sampleX] * weight;
          weightSum += weight;
        }
      }
      output[y * width + x] = sum / (weightSum || 1);
    }
  }
  return output;
};

const normaliseFloat = (input: Float32Array) => {
  let min = Infinity;
  let max = -Infinity;
  for (let index = 0; index < input.length; index += 1) {
    const value = input[index];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min;
  const output = new Float32Array(input.length);
  if (range <= 1e-5) {
    for (let i = 0; i < input.length; i += 1) {
      output[i] = 0;
    }
    return output;
  }
  for (let index = 0; index < input.length; index += 1) {
    output[index] = (input[index] - min) / range;
  }
  return output;
};

const buildCostLevels = (
  baseCost: Float32Array,
  width: number,
  height: number,
  config: Required<PreprocessConfig>
) => {
  const levels: CostLevel[] = [];
  let currentWidth = width;
  let currentHeight = height;
  let current = baseCost;
  let scale = 1;
  const maxLevels = Math.max(1, config.pyramidLevels);
  for (let level = 0; level < maxLevels; level += 1) {
    levels.push({ width: currentWidth, height: currentHeight, data: current, scale });
    if (currentWidth <= 8 && currentHeight <= 8) {
      break;
    }
    const nextWidth = Math.max(1, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(1, Math.floor(currentHeight / 2));
    const next = new Float32Array(nextWidth * nextHeight);
    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          const sourceY = Math.min(currentHeight - 1, y * 2 + dy);
          for (let dx = 0; dx < 2; dx += 1) {
            const sourceX = Math.min(currentWidth - 1, x * 2 + dx);
            sum += current[sourceY * currentWidth + sourceX];
            count += 1;
          }
        }
        next[y * nextWidth + x] = sum / (count || 1);
      }
    }
    current = next;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
    scale *= 2;
  }
  return levels;
};

const buildGridModel = (cost: Float32Array, width: number, height: number): GridModel => {
  let maxCost = 0;
  for (let index = 0; index < cost.length; index += 1) {
    if (cost[index] > maxCost) {
      maxCost = cost[index];
    }
  }
  return { width, height, costs: cost, maxCost: Math.max(maxCost, 1) };
};

const preprocess = (request: PreprocessRequest) => {
  const config: Required<PreprocessConfig> = {
    ...DEFAULT_CONFIG,
    ...(request.config ?? {}),
  };
  const cacheKey = getCacheKey(request);
  const cached = roiCache.get(cacheKey);
  if (cached) {
    cached.stats.lastUsed = Date.now();
    cached.stats.hits += 1;
    cacheHits += 1;
    return { result: cached, cacheHit: true };
  }
  cacheMisses += 1;
  const roi = request.roi ?? null;
  const { width, height, originX, originY, data } = extractRoi(request.raster, roi);
  const grayscale = toGrayscale(data);
  const clahe = applyClahe(grayscale, width, height, config);
  const denoised = applyDenoise(clahe, width, height, config);
  const normalized = normaliseFloat(denoised);
  const prepped = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < normalized.length; index += 1) {
    const value = clamp(Math.round(normalized[index] * 255), 0, 255);
    const offset = index * 4;
    prepped[offset] = value;
    prepped[offset + 1] = value;
    prepped[offset + 2] = value;
    prepped[offset + 3] = 255;
  }
  const edgeMap = buildEdgeMap(prepped, width, height);
  const baseCost = new Float32Array(width * height);
  const magnitudeNormalizer = Math.max(edgeMap.maxMagnitude, 1);
  for (let index = 0; index < baseCost.length; index += 1) {
    const gradient = edgeMap.magnitudes[index] / magnitudeNormalizer;
    const localCost = 1 + gradient * 6;
    const smoothBoost = normalized[index] * 0.35;
    baseCost[index] = clamp(localCost - smoothBoost, 0.1, 10);
  }
  const costLevels = buildCostLevels(baseCost, width, height, config);
  const gridModel = buildGridModel(baseCost, width, height);
  const cachedResult: CachedPreprocess = {
    key: cacheKey,
    roi,
    originX,
    originY,
    width,
    height,
    grayscale,
    clahe,
    denoised,
    edgeMap,
    costLevels,
    gridModel,
    stats: {
      createdAt: Date.now(),
      lastUsed: Date.now(),
      hits: 0,
    },
  };
  roiCache.set(cacheKey, cachedResult);
  return { result: cachedResult, cacheHit: false };
};

export const clearSegmentationCache = () => {
  roiCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
};

export const getSegmentationCacheStats = () => ({
  entries: roiCache.size,
  hits: cacheHits,
  misses: cacheMisses,
});

const toGlobalPoint = (
  point: { x: number; y: number },
  preprocessResult: CachedPreprocess,
  raster: RasterImageData
) => {
  const px = (point.x + preprocessResult.originX) / raster.width;
  const py = (point.y + preprocessResult.originY) / raster.height;
  return { x: clamp(px, 0, 1), y: clamp(py, 0, 1) };
};

const toLocalPoint = (
  point: { x: number; y: number },
  preprocessResult: CachedPreprocess,
  raster: RasterImageData
) => {
  const px = clamp(point.x, 0, 1) * raster.width - preprocessResult.originX;
  const py = clamp(point.y, 0, 1) * raster.height - preprocessResult.originY;
  return {
    x: clamp(px, 0, preprocessResult.width - 1),
    y: clamp(py, 0, preprocessResult.height - 1),
  };
};

export interface VectorizeRequest {
  raster: RasterImageData;
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
  roi?: ROI | null;
  cacheKey?: string;
  config?: PreprocessConfig;
  smoothingIterations?: number;
  snapSearchRadius?: number;
}

export interface VectorizeResult {
  polygon: Array<{ x: number; y: number }>;
  snappedPolygon: Array<{ x: number; y: number }>;
  debug: {
    cacheHit: boolean;
    rawPolygon: Array<{ x: number; y: number }>;
    smoothIterations: number;
  };
}

const normalisePolygonToGlobal = (
  polygon: Array<{ x: number; y: number }>,
  preprocessResult: CachedPreprocess,
  raster: RasterImageData
) =>
  polygon.map((point) =>
    toGlobalPoint(
      {
        x: point.x * preprocessResult.width,
        y: point.y * preprocessResult.height,
      },
      preprocessResult,
      raster
    )
  );

export const vectorizeAndSnap = (request: VectorizeRequest): VectorizeResult => {
  const { raster, mask, maskWidth, maskHeight, smoothingIterations } = request;
  const { result, cacheHit } = preprocess({
    raster,
    roi: request.roi ?? null,
    cacheKey: request.cacheKey,
    config: request.config,
  });
  const polygonLocal = extractLargestPolygonFromMask(mask, maskWidth, maskHeight);
  const smoothIterations = Math.max(0, Math.floor(smoothingIterations ?? 1));
  const smoothedLocal =
    smoothIterations > 0 ? smoothPolygon(polygonLocal, smoothIterations) : polygonLocal;
  const snappedLocal = snapPolygonToEdges(smoothedLocal, {
    edgeMap: result.edgeMap,
    imageWidth: result.width,
    imageHeight: result.height,
    searchRadius: request.snapSearchRadius,
  });
  const smoothedGlobal = normalisePolygonToGlobal(smoothedLocal, result, raster);
  const snappedGlobal = normalisePolygonToGlobal(snappedLocal, result, raster);
  return {
    polygon: smoothedGlobal,
    snappedPolygon: snappedGlobal,
    debug: {
      cacheHit,
      rawPolygon: normalisePolygonToGlobal(polygonLocal, result, raster),
      smoothIterations,
    },
  };
};

interface DijkstraNode {
  index: number;
  cost: number;
}

const directions: Array<{ dx: number; dy: number; weight: number }> = [
  { dx: 1, dy: 0, weight: 1 },
  { dx: -1, dy: 0, weight: 1 },
  { dx: 0, dy: 1, weight: 1 },
  { dx: 0, dy: -1, weight: 1 },
  { dx: 1, dy: 1, weight: Math.SQRT2 },
  { dx: -1, dy: 1, weight: Math.SQRT2 },
  { dx: 1, dy: -1, weight: Math.SQRT2 },
  { dx: -1, dy: -1, weight: Math.SQRT2 },
];

const computeShortestPath = (
  level: CostLevel,
  start: { x: number; y: number },
  end: { x: number; y: number },
  bounds?: { minX: number; minY: number; maxX: number; maxY: number }
) => {
  const { width, height, data } = level;
  const total = width * height;
  const distances = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(total).fill(-1);
  const visited = new Uint8Array(total);
  const queue: DijkstraNode[] = [];
  const inBounds = (x: number, y: number) => {
    if (bounds) {
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
        return false;
      }
    }
    return x >= 0 && x < width && y >= 0 && y < height;
  };
  const startIndex = Math.floor(start.y) * width + Math.floor(start.x);
  const endIndex = Math.floor(end.y) * width + Math.floor(end.x);
  const push = (node: DijkstraNode) => {
    queue.push(node);
  };
  const pop = () => {
    let bestIndex = -1;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      if (node.cost < bestCost) {
        bestCost = node.cost;
        bestIndex = index;
      }
    }
    if (bestIndex === -1) {
      return null;
    }
    const [node] = queue.splice(bestIndex, 1);
    return node;
  };
  distances[startIndex] = 0;
  push({ index: startIndex, cost: 0 });
  let nodesExpanded = 0;
  while (queue.length > 0) {
    const current = pop();
    if (!current) break;
    if (visited[current.index]) continue;
    visited[current.index] = 1;
    nodesExpanded += 1;
    if (current.index === endIndex) {
      break;
    }
    const currentY = Math.floor(current.index / width);
    const currentX = current.index % width;
    for (const direction of directions) {
      const nx = currentX + direction.dx;
      const ny = currentY + direction.dy;
      if (!inBounds(nx, ny)) continue;
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) continue;
      const travel = (data[neighborIndex] + data[current.index]) * 0.5 * direction.weight;
      const nextCost = distances[current.index] + travel;
      if (nextCost < distances[neighborIndex]) {
        distances[neighborIndex] = nextCost;
        previous[neighborIndex] = current.index;
        push({ index: neighborIndex, cost: nextCost });
      }
    }
  }
  const path: Array<{ x: number; y: number }> = [];
  let index = endIndex;
  if (!Number.isFinite(distances[endIndex])) {
    return { path, cost: Number.POSITIVE_INFINITY, nodesExpanded };
  }
  while (index !== -1 && index < total) {
    const y = Math.floor(index / width);
    const x = index % width;
    path.push({ x, y });
    if (index === startIndex) {
      break;
    }
    index = previous[index];
  }
  path.reverse();
  return { path, cost: distances[endIndex], nodesExpanded };
};

export interface LiveWireRequest {
  raster: RasterImageData;
  start: { x: number; y: number };
  end: { x: number; y: number };
  roi?: ROI | null;
  cacheKey?: string;
  config?: PreprocessConfig;
  coarseMargin?: number;
  clampToEntrance?: EntranceZone | null;
}

export interface LiveWireResult {
  path: Array<{ x: number; y: number }>;
  cost: number;
  debug: {
    cacheHit: boolean;
    levelsVisited: number[];
    nodesExpanded: number;
    bounds: Array<{ level: number; minX: number; minY: number; maxX: number; maxY: number }>;
  };
}

const clampBounds = (
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  width: number,
  height: number
) => ({
  minX: clamp(bounds.minX, 0, width - 1),
  minY: clamp(bounds.minY, 0, height - 1),
  maxX: clamp(bounds.maxX, 0, width - 1),
  maxY: clamp(bounds.maxY, 0, height - 1),
});

export const liveWirePath = (request: LiveWireRequest): LiveWireResult => {
  const { raster, start, end } = request;
  const { result, cacheHit } = preprocess({
    raster,
    roi: request.roi ?? null,
    cacheKey: request.cacheKey,
    config: request.config,
  });
  const startLocal = toLocalPoint(start, result, raster);
  const endLocal = toLocalPoint(end, result, raster);
  const levels = [...result.costLevels].reverse();
  const boundsDebug: Array<{ level: number; minX: number; minY: number; maxX: number; maxY: number }> = [];
  let accumulatedPath: Array<{ x: number; y: number }> | null = null;
  let finalCost = Number.POSITIVE_INFINITY;
  let totalNodes = 0;
  levels.forEach((level, index) => {
    const scale = level.scale;
    const startScaled = {
      x: startLocal.x / scale,
      y: startLocal.y / scale,
    };
    const endScaled = {
      x: endLocal.x / scale,
      y: endLocal.y / scale,
    };
    let bounds: { minX: number; minY: number; maxX: number; maxY: number } | undefined;
    if (accumulatedPath) {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      accumulatedPath.forEach((point) => {
        const scaledX = point.x / scale;
        const scaledY = point.y / scale;
        if (scaledX < minX) minX = scaledX;
        if (scaledX > maxX) maxX = scaledX;
        if (scaledY < minY) minY = scaledY;
        if (scaledY > maxY) maxY = scaledY;
      });
      const margin = (request.coarseMargin ?? 3) * (index + 1);
      bounds = clampBounds(
        {
          minX: Math.floor(minX) - margin,
          minY: Math.floor(minY) - margin,
          maxX: Math.ceil(maxX) + margin,
          maxY: Math.ceil(maxY) + margin,
        },
        level.width,
        level.height
      );
    }
    const { path, cost, nodesExpanded } = computeShortestPath(level, startScaled, endScaled, bounds);
    totalNodes += nodesExpanded;
    boundsDebug.push({
      level: level.scale,
      minX: bounds?.minX ?? 0,
      minY: bounds?.minY ?? 0,
      maxX: bounds?.maxX ?? level.width - 1,
      maxY: bounds?.maxY ?? level.height - 1,
    });
    if (path.length > 0) {
      accumulatedPath = path.map((point) => ({ x: point.x * scale, y: point.y * scale }));
      if (index === levels.length - 1) {
        finalCost = cost;
      }
    }
  });
  const finalPath = accumulatedPath ? accumulatedPath : [];
  const globalPath = finalPath.map((point) => toGlobalPoint(point, result, raster));
  return {
    path: globalPath,
    cost: finalCost,
    debug: {
      cacheHit,
      levelsVisited: levels.map((level) => level.scale),
      nodesExpanded: totalNodes,
      bounds: boundsDebug,
    },
  };
};

class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 1;
    }
  }

  next() {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

export interface SmartWandRequest {
  raster: RasterImageData;
  seed: { x: number; y: number };
  roi?: ROI | null;
  cacheKey?: string;
  config?: PreprocessConfig;
  colorTolerance?: number;
  gradientThreshold?: number;
  maxPixels?: number;
  entranceZones?: EntranceZone[];
  lockEntranceId?: string | null;
  rngSeed?: number;
}

export interface SmartWandResult {
  polygon: Array<{ x: number; y: number }>;
  mask: Uint8Array;
  entranceLocked: boolean;
  lockedEntranceId: string | null;
  debug: {
    cacheHit: boolean;
    iterations: number;
    accepted: number;
    frontier: number;
    rngSeed: number;
  };
}

const isInsideEntrance = (x: number, y: number, entrance: EntranceZone) => {
  const dx = x - entrance.center.x;
  const dy = y - entrance.center.y;
  return dx * dx + dy * dy <= entrance.radius * entrance.radius;
};

const rasterFloodFill = (
  raster: RasterImageData,
  preprocessResult: CachedPreprocess,
  seedLocal: { x: number; y: number },
  options: {
    colorTolerance: number;
    gradientThreshold: number;
    maxPixels: number;
    entranceZones: EntranceZone[];
    lockEntranceId: string | null;
    rng: DeterministicRng;
  }
) => {
  const width = preprocessResult.width;
  const height = preprocessResult.height;
  const mask = new Uint8Array(width * height);
  const visited = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  const startX = Math.floor(seedLocal.x);
  const startY = Math.floor(seedLocal.y);
  const seedIndex = startY * width + startX;
  const seedGlobalX = startX + preprocessResult.originX;
  const seedGlobalY = startY + preprocessResult.originY;
  const seedOffset = (seedGlobalY * raster.width + seedGlobalX) * 4;
  const seedColor: [number, number, number] = [
    raster.data[seedOffset],
    raster.data[seedOffset + 1],
    raster.data[seedOffset + 2],
  ];
  queue[tail] = seedIndex;
  tail += 1;
  let iterations = 0;
  let accepted = 0;
  let entranceLocked = false;
  let lockedEntranceId: string | null = null;
  const entrances = options.entranceZones;
  const clampIndex = (x: number, y: number) => clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1);
  const sampleColorDistance = (index: number) => {
    const localY = Math.floor(index / width);
    const localX = index % width;
    const globalX = localX + preprocessResult.originX;
    const globalY = localY + preprocessResult.originY;
    const offset = (globalY * raster.width + globalX) * 4;
    const dr = raster.data[offset] - seedColor[0];
    const dg = raster.data[offset + 1] - seedColor[1];
    const db = raster.data[offset + 2] - seedColor[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  while (head < tail && accepted < options.maxPixels) {
    const index = queue[head];
    head += 1;
    if (visited[index]) continue;
    visited[index] = 1;
    iterations += 1;
    const localY = Math.floor(index / width);
    const localX = index % width;
    const globalX = localX + preprocessResult.originX;
    const globalY = localY + preprocessResult.originY;
    let entranceMatch: EntranceZone | null = null;
    for (const entrance of entrances) {
      if (lockedEntranceId && entrance.id !== lockedEntranceId) {
        continue;
      }
      if (isInsideEntrance(globalX, globalY, entrance)) {
        entranceMatch = entrance;
        break;
      }
    }
    const gradient = preprocessResult.edgeMap.magnitudes[index];
    const isSeedPixel = index === seedIndex;
    if (!isSeedPixel && gradient > options.gradientThreshold && !entranceMatch) {
      continue;
    }
    const distance = sampleColorDistance(index);
    if (distance > options.colorTolerance) {
      continue;
    }
    mask[index] = 1;
    accepted += 1;
    if (entranceMatch) {
      entranceLocked = true;
      lockedEntranceId = entranceMatch.id;
    }
    const neighbors: Array<[number, number]> = [
      [localX + 1, localY],
      [localX - 1, localY],
      [localX, localY + 1],
      [localX, localY - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) continue;
      const shouldPush = options.rng.next() > 0.1;
      if (shouldPush) {
        queue[tail] = neighborIndex;
        tail += 1;
      } else {
        const fallbackIndex = clampIndex(nx, ny);
        if (!visited[fallbackIndex]) {
          queue[tail] = fallbackIndex;
          tail += 1;
        }
      }
    }
  }
  return { mask, iterations, accepted, entranceLocked, lockedEntranceId, frontier: tail - head };
};

export const smartWand = (request: SmartWandRequest): SmartWandResult => {
  const { raster } = request;
  const { result, cacheHit } = preprocess({
    raster,
    roi: request.roi ?? null,
    cacheKey: request.cacheKey,
    config: request.config,
  });
  const seedLocal = toLocalPoint(request.seed, result, raster);
  const rng = new DeterministicRng(request.rngSeed ?? 1);
  const flood = rasterFloodFill(
    raster,
    result,
    seedLocal,
    {
      colorTolerance: request.colorTolerance ?? 42,
      gradientThreshold: request.gradientThreshold ?? Math.max(result.edgeMap.maxMagnitude, 1),
      maxPixels: request.maxPixels ?? Math.max(512, Math.floor(result.width * result.height * 0.65)),
      entranceZones: request.entranceZones ?? [],
      lockEntranceId: request.lockEntranceId ?? null,
      rng,
    }
  );
  let { mask, iterations, accepted, entranceLocked, lockedEntranceId, frontier } = flood;
  if (!entranceLocked && request.entranceZones && request.entranceZones.length > 0) {
    outer: for (const zone of request.entranceZones) {
      if (lockedEntranceId && zone.id !== lockedEntranceId) {
        continue;
      }
      for (let index = 0; index < mask.length; index += 1) {
        if (!mask[index]) continue;
        const localY = Math.floor(index / result.width);
        const localX = index % result.width;
        const globalX = localX + result.originX;
        const globalY = localY + result.originY;
        if (isInsideEntrance(globalX, globalY, zone)) {
          entranceLocked = true;
          lockedEntranceId = zone.id;
          break outer;
        }
      }
    }
  }
  const polygonLocal = extractLargestPolygonFromMask(mask, result.width, result.height);
  const snappedLocal = snapPolygonToEdges(polygonLocal, {
    edgeMap: result.edgeMap,
    imageWidth: result.width,
    imageHeight: result.height,
    searchRadius: request.config?.claheTileSize ?? 24,
  });
  const snappedGlobal = normalisePolygonToGlobal(snappedLocal, result, raster);
  if (!entranceLocked && request.entranceZones && request.entranceZones.length > 0) {
    const width = raster.width;
    const height = raster.height;
    const normalising = Math.max(width, height);
    outer: for (const zone of request.entranceZones) {
      if (lockedEntranceId && zone.id !== lockedEntranceId) continue;
      const center = { x: zone.center.x / width, y: zone.center.y / height };
      const radius = zone.radius / normalising;
      for (const point of snappedGlobal) {
        const distance = Math.hypot(point.x - center.x, point.y - center.y);
        if (distance <= radius * 1.5) {
          entranceLocked = true;
          lockedEntranceId = zone.id;
          break outer;
        }
      }
    }
  }
  return {
    polygon: snappedGlobal,
    mask,
    entranceLocked,
    lockedEntranceId: lockedEntranceId ?? null,
    debug: {
      cacheHit,
      iterations,
      accepted,
      frontier,
      rngSeed: request.rngSeed ?? 1,
    },
  };
};

