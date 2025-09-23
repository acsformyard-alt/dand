import type { Point, SignedDistanceField } from '../state/defineRoomsStore';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const nearlyEqual = (a: number, b: number, epsilon = 1e-5) => Math.abs(a - b) <= epsilon;

const pointKey = (point: Point) => `${point.x.toFixed(5)}:${point.y.toFixed(5)}`;

export interface CostLevel {
  width: number;
  height: number;
  data: Float32Array;
  scale: number;
}

export interface CostPyramid {
  width: number;
  height: number;
  levels: CostLevel[];
}

export interface CostPyramidOptions {
  levels?: number;
  smoothIterations?: number;
}

export interface LiveWireOptions {
  smoothing?: number;
  allowDiagonals?: boolean;
}

export interface SmartWandOptions {
  tolerance?: number;
  connectivity?: 4 | 8;
  minArea?: number;
  softenEdges?: boolean;
}

export interface SmartWandResult {
  mask: Uint8Array;
  width: number;
  height: number;
  polygon: Point[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  seed: Point;
  area: number;
}

export interface VectorFitOptions {
  simplifyTolerance?: number;
}

const toGrayscale = (source: Uint8ClampedArray | Uint8Array | number[], width: number, height: number) => {
  const grayscale = new Float32Array(width * height);
  const hasAlpha = source.length === width * height * 4;
  for (let i = 0; i < width * height; i += 1) {
    if (hasAlpha) {
      const index = i * 4;
      const r = source[index];
      const g = source[index + 1];
      const b = source[index + 2];
      grayscale[i] = 0.2989 * r + 0.587 * g + 0.114 * b;
    } else {
      grayscale[i] = source[i];
    }
  }
  return grayscale;
};

const blurField = (data: Float32Array, width: number, height: number, iterations: number) => {
  if (iterations <= 0) {
    return data;
  }
  const temp = new Float32Array(data.length);
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
              continue;
            }
            total += data[ny * width + nx];
            count += 1;
          }
        }
        temp[y * width + x] = total / count;
      }
    }
    data.set(temp);
  }
  return data;
};

export const buildCostPyramid = (
  image: Uint8ClampedArray | Uint8Array | number[],
  width: number,
  height: number,
  options?: CostPyramidOptions
): CostPyramid => {
  const grayscale = image instanceof Float32Array ? image : toGrayscale(image, width, height);
  const levels = Math.max(1, Math.round(options?.levels ?? 4));
  const smoothIterations = Math.max(0, Math.round(options?.smoothIterations ?? 1));

  const base = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const center = grayscale[y * width + x];
      const right = grayscale[y * width + Math.min(width - 1, x + 1)];
      const bottom = grayscale[Math.min(height - 1, y + 1) * width + x];
      const gradientX = right - center;
      const gradientY = bottom - center;
      const magnitude = Math.sqrt(gradientX * gradientX + gradientY * gradientY);
      base[y * width + x] = magnitude;
    }
  }

  blurField(base, width, height, smoothIterations);

  const pyramidLevels: CostLevel[] = [{ width, height, data: base, scale: 1 }];

  let currentWidth = width;
  let currentHeight = height;
  let previous = base;
  for (let level = 1; level < levels; level += 1) {
    const nextWidth = Math.max(1, Math.floor(currentWidth / 2));
    const nextHeight = Math.max(1, Math.floor(currentHeight / 2));
    const downsampled = new Float32Array(nextWidth * nextHeight);
    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        let total = 0;
        let count = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const srcX = Math.min(currentWidth - 1, x * 2 + dx);
            const srcY = Math.min(currentHeight - 1, y * 2 + dy);
            total += previous[srcY * currentWidth + srcX];
            count += 1;
          }
        }
        downsampled[y * nextWidth + x] = total / count;
      }
    }
    blurField(downsampled, nextWidth, nextHeight, Math.max(0, smoothIterations - 1));
    pyramidLevels.push({ width: nextWidth, height: nextHeight, data: downsampled, scale: 2 ** level });
    previous = downsampled;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  return { width, height, levels: pyramidLevels };
};

class MinHeap {
  private heap: Array<{ index: number; cost: number }> = [];

  push(node: { index: number; cost: number }) {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): { index: number; cost: number } | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }
    const top = this.heap[0];
    const end = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = end;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].cost <= this.heap[index].cost) {
        break;
      }
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private bubbleDown(index: number) {
    const length = this.heap.length;
    while (true) {
      let left = index * 2 + 1;
      let right = left + 1;
      let smallest = index;
      if (left < length && this.heap[left].cost < this.heap[smallest].cost) {
        smallest = left;
      }
      if (right < length && this.heap[right].cost < this.heap[smallest].cost) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }

  get size() {
    return this.heap.length;
  }
}

export const traceLiveWire = (
  pyramid: CostPyramid,
  start: Point,
  end: Point,
  options?: LiveWireOptions
): Point[] => {
  const base = pyramid.levels[0];
  const width = base.width;
  const height = base.height;
  const startX = clamp(Math.round(start.x * (width - 1)), 0, width - 1);
  const startY = clamp(Math.round(start.y * (height - 1)), 0, height - 1);
  const endX = clamp(Math.round(end.x * (width - 1)), 0, width - 1);
  const endY = clamp(Math.round(end.y * (height - 1)), 0, height - 1);
  const startIndex = startY * width + startX;
  const endIndex = endY * width + endX;

  const allowDiagonals = options?.allowDiagonals ?? true;

  const dist = new Float32Array(width * height);
  dist.fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(width * height);
  prev.fill(-1);
  const visited = new Uint8Array(width * height);

  const heap = new MinHeap();
  dist[startIndex] = 0;
  heap.push({ index: startIndex, cost: 0 });

  const directions = allowDiagonals
    ? [
        { dx: 1, dy: 0, weight: 1 },
        { dx: -1, dy: 0, weight: 1 },
        { dx: 0, dy: 1, weight: 1 },
        { dx: 0, dy: -1, weight: 1 },
        { dx: 1, dy: 1, weight: Math.SQRT2 },
        { dx: -1, dy: 1, weight: Math.SQRT2 },
        { dx: 1, dy: -1, weight: Math.SQRT2 },
        { dx: -1, dy: -1, weight: Math.SQRT2 },
      ]
    : [
        { dx: 1, dy: 0, weight: 1 },
        { dx: -1, dy: 0, weight: 1 },
        { dx: 0, dy: 1, weight: 1 },
        { dx: 0, dy: -1, weight: 1 },
      ];

  while (heap.size) {
    const node = heap.pop();
    if (!node) break;
    const { index, cost } = node;
    if (visited[index]) continue;
    visited[index] = 1;
    if (index === endIndex) break;

    const x = index % width;
    const y = Math.floor(index / width);
    for (const direction of directions) {
      const nx = x + direction.dx;
      const ny = y + direction.dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) continue;
      const edgeCost = (base.data[neighborIndex] + base.data[index]) * 0.5 + direction.weight;
      const nextCost = cost + edgeCost;
      if (nextCost < dist[neighborIndex]) {
        dist[neighborIndex] = nextCost;
        prev[neighborIndex] = index;
        heap.push({ index: neighborIndex, cost: nextCost });
      }
    }
  }

  const path: Point[] = [];
  let current = endIndex;
  if (prev[current] === -1) {
    path.push(start, end);
    return path;
  }
  while (current !== -1) {
    const x = (current % width) / (width - 1 || 1);
    const y = Math.floor(current / width) / (height - 1 || 1);
    path.push({ x, y });
    if (current === startIndex) break;
    current = prev[current];
  }
  path.reverse();
  return path;
};

const colorDistance = (a: [number, number, number], b: [number, number, number]) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const marchingSquares = (mask: Uint8Array, width: number, height: number) => {
  const segments: Array<{ start: Point; end: Point }> = [];

  const edgePoint = (x: number, y: number, edge: 'top' | 'bottom' | 'left' | 'right'): Point => {
    switch (edge) {
      case 'top':
        return { x: x + 0.5, y };
      case 'bottom':
        return { x: x + 0.5, y: y + 1 };
      case 'left':
        return { x, y: y + 0.5 };
      case 'right':
        return { x: x + 1, y: y + 0.5 };
    }
  };

  const templates: Record<number, Array<[Point, Point]>> = {
    0: [],
    1: [[edgePoint(0, 0, 'left'), edgePoint(0, 0, 'top')]],
    2: [[edgePoint(0, 0, 'top'), edgePoint(0, 0, 'right')]],
    3: [[edgePoint(0, 0, 'left'), edgePoint(0, 0, 'right')]],
    4: [[edgePoint(0, 0, 'right'), edgePoint(0, 0, 'bottom')]],
    5: [
      [edgePoint(0, 0, 'left'), edgePoint(0, 0, 'bottom')],
      [edgePoint(0, 0, 'top'), edgePoint(0, 0, 'right')],
    ],
    6: [[edgePoint(0, 0, 'top'), edgePoint(0, 0, 'bottom')]],
    7: [[edgePoint(0, 0, 'left'), edgePoint(0, 0, 'bottom')]],
    8: [[edgePoint(0, 0, 'bottom'), edgePoint(0, 0, 'left')]],
    9: [[edgePoint(0, 0, 'top'), edgePoint(0, 0, 'bottom')]],
    10: [
      [edgePoint(0, 0, 'top'), edgePoint(0, 0, 'right')],
      [edgePoint(0, 0, 'bottom'), edgePoint(0, 0, 'left')],
    ],
    11: [[edgePoint(0, 0, 'right'), edgePoint(0, 0, 'bottom')]],
    12: [[edgePoint(0, 0, 'right'), edgePoint(0, 0, 'left')]],
    13: [[edgePoint(0, 0, 'top'), edgePoint(0, 0, 'right')]],
    14: [[edgePoint(0, 0, 'left'), edgePoint(0, 0, 'top')]],
    15: [],
  };

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const topLeft = mask[y * width + x] > 0;
      const topRight = mask[y * width + x + 1] > 0;
      const bottomRight = mask[(y + 1) * width + x + 1] > 0;
      const bottomLeft = mask[(y + 1) * width + x] > 0;
      let key = 0;
      if (topLeft) key |= 1;
      if (topRight) key |= 2;
      if (bottomRight) key |= 4;
      if (bottomLeft) key |= 8;
      if (key === 0 || key === 15) continue;
      const template = templates[key];
      for (const [start, end] of template) {
        segments.push({
          start: { x: start.x + x, y: start.y + y },
          end: { x: end.x + x, y: end.y + y },
        });
      }
    }
  }

  if (segments.length === 0) {
    return [] as Point[];
  }

  const polygon: Point[] = [];
  const used = new Array(segments.length).fill(false);
  polygon.push(segments[0].start);
  polygon.push(segments[0].end);
  used[0] = true;

  const equals = (a: Point, b: Point) => nearlyEqual(a.x, b.x, 1e-3) && nearlyEqual(a.y, b.y, 1e-3);

  while (polygon.length < 5000) {
    const current = polygon[polygon.length - 1];
    let advanced = false;
    for (let i = 0; i < segments.length; i += 1) {
      if (used[i]) continue;
      const segment = segments[i];
      if (equals(segment.start, current)) {
        polygon.push(segment.end);
        used[i] = true;
        advanced = true;
        break;
      }
      if (equals(segment.end, current)) {
        polygon.push(segment.start);
        used[i] = true;
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      break;
    }
    if (equals(polygon[polygon.length - 1], polygon[0])) {
      polygon.pop();
      break;
    }
  }

  return polygon;
};

const dedupePoints = (points: Point[]) => {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = pointKey(point);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const simplifyDouglasPeucker = (points: Point[], tolerance: number) => {
  if (points.length <= 2) {
    return points.slice();
  }
  const sqTolerance = tolerance * tolerance;

  const sqDistanceToSegment = (p: Point, a: Point, b: Point) => {
    let x = a.x;
    let y = a.y;
    let dx = b.x - x;
    let dy = b.y - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b.x;
        y = b.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p.x - x;
    dy = p.y - y;
    return dx * dx + dy * dy;
  };

  const simplifyStep = (pts: Point[], first: number, last: number, simplified: Point[]) => {
    let maxSqDist = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const sqDist = sqDistanceToSegment(pts[i], pts[first], pts[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }
    if (index !== -1) {
      if (index - first > 1) simplifyStep(pts, first, index, simplified);
      simplified.push(pts[index]);
      if (last - index > 1) simplifyStep(pts, index, last, simplified);
    }
  };

  const last = points.length - 1;
  const result = [points[0]];
  simplifyStep(points, 0, last, result);
  result.push(points[last]);
  return result;
};

const maskToPolygon = (
  mask: Uint8Array,
  width: number,
  height: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
) => {
  const raw = marchingSquares(mask, width, height);
  if (raw.length === 0) {
    return [] as Point[];
  }
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  const widthDenominator = width - 1 || 1;
  const heightDenominator = height - 1 || 1;
  const polygon = raw.map((point) => ({
    x: bounds.minX + (point.x / widthDenominator) * scaleX,
    y: bounds.minY + (point.y / heightDenominator) * scaleY,
  }));
  return simplifyDouglasPeucker(dedupePoints(polygon), 0.001);
};

const computeMaskBounds = (mask: Uint8Array, width: number, height: number) => {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        area += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (area === 0) {
    return { bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, area: 0 };
  }
  return {
    bounds: {
      minX: minX / (width - 1 || 1),
      minY: minY / (height - 1 || 1),
      maxX: maxX / (width - 1 || 1),
      maxY: maxY / (height - 1 || 1),
    },
    area,
  };
};

export const smartWand = (
  image: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  seed: Point,
  options?: SmartWandOptions
): SmartWandResult => {
  const pixels = width * height;
  const channels = Math.floor(image.length / pixels);
  if (channels < 3) {
    throw new Error('Smart wand requires RGB or RGBA image data');
  }
  const stride = channels >= 4 ? 4 : 3;
  const tolerance = clamp(options?.tolerance ?? 24, 1, 255);
  const connectivity = options?.connectivity === 4 ? 4 : 8;

  const sx = clamp(Math.round(seed.x * (width - 1)), 0, width - 1);
  const sy = clamp(Math.round(seed.y * (height - 1)), 0, height - 1);
  const seedIndex = sy * width + sx;
  const seedColor: [number, number, number] = [
    image[seedIndex * stride],
    image[seedIndex * stride + 1],
    image[seedIndex * stride + 2],
  ];

  const visited = new Uint8Array(pixels);
  const mask = new Uint8Array(pixels);
  const queue = new Uint32Array(pixels);
  let head = 0;
  let tail = 0;
  queue[tail++] = seedIndex;
  visited[seedIndex] = 1;
  mask[seedIndex] = 1;

  const neighborOffsets = connectivity === 8 ? [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1] : [-width, -1, 1, width];

  while (head < tail) {
    const currentIndex = queue[head++];
    const currentColor: [number, number, number] = [
      image[currentIndex * stride],
      image[currentIndex * stride + 1],
      image[currentIndex * stride + 2],
    ];
    for (const offset of neighborOffsets) {
      const neighborIndex = currentIndex + offset;
      if (neighborIndex < 0 || neighborIndex >= pixels) continue;
      if (visited[neighborIndex]) continue;
      const nx = neighborIndex % width;
      const ny = Math.floor(neighborIndex / width);
      const cx = currentIndex % width;
      const cy = Math.floor(currentIndex / width);
      if (Math.abs(nx - cx) > 1 || Math.abs(ny - cy) > 1) continue;
      visited[neighborIndex] = 1;
      const neighborColor: [number, number, number] = [
        image[neighborIndex * stride],
        image[neighborIndex * stride + 1],
        image[neighborIndex * stride + 2],
      ];
      const diff = colorDistance(currentColor, neighborColor);
      const seedDiff = colorDistance(seedColor, neighborColor);
      if (diff <= tolerance && seedDiff <= tolerance * 1.5) {
        mask[neighborIndex] = 1;
        queue[tail++] = neighborIndex;
      }
    }
  }

  if (options?.softenEdges) {
    const smoothed = new Float32Array(pixels);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let total = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            total += mask[ny * width + nx];
            count += 1;
          }
        }
        smoothed[y * width + x] = total / count;
      }
    }
    for (let i = 0; i < pixels; i += 1) {
      mask[i] = smoothed[i] >= 0.35 ? 1 : 0;
    }
  }

  let stats = computeMaskBounds(mask, width, height);
  const minArea = Math.max(1, Math.round(options?.minArea ?? width * height * 0.0005));
  if (stats.area < minArea) {
    mask.fill(0);
    mask[seedIndex] = 1;
    stats = computeMaskBounds(mask, width, height);
  }

  const polygon = maskToPolygon(mask, width, height, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  if (polygon.length === 0) {
    polygon.push({ x: seed.x, y: seed.y });
  }

  return {
    mask,
    width,
    height,
    polygon,
    bounds: stats.bounds,
    seed,
    area: stats.area,
  };
};

const distanceTransform = (mask: Uint8Array, width: number, height: number, invert: boolean) => {
  const dist = new Float32Array(width * height);
  const INF = 1e6;
  for (let i = 0; i < width * height; i += 1) {
    const inside = mask[i] > 0;
    dist[i] = invert ? (inside ? INF : 0) : inside ? 0 : INF;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let value = dist[index];
      if (x > 0) value = Math.min(value, dist[index - 1] + 1);
      if (y > 0) value = Math.min(value, dist[index - width] + 1);
      if (x > 0 && y > 0) value = Math.min(value, dist[index - width - 1] + Math.SQRT2);
      if (x < width - 1 && y > 0) value = Math.min(value, dist[index - width + 1] + Math.SQRT2);
      dist[index] = value;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      let value = dist[index];
      if (x < width - 1) value = Math.min(value, dist[index + 1] + 1);
      if (y < height - 1) value = Math.min(value, dist[index + width] + 1);
      if (x < width - 1 && y < height - 1) value = Math.min(value, dist[index + width + 1] + Math.SQRT2);
      if (x > 0 && y < height - 1) value = Math.min(value, dist[index + width - 1] + Math.SQRT2);
      dist[index] = value;
    }
  }
  return dist;
};

export const computeSignedDistanceField = (
  mask: Uint8Array,
  width: number,
  height: number
): SignedDistanceField => {
  const inside = distanceTransform(mask, width, height, false);
  const outside = distanceTransform(mask, width, height, true);
  const values = new Float32Array(width * height);
  const scale = Math.max(width, height) || 1;
  for (let i = 0; i < values.length; i += 1) {
    const outsideDist = Math.sqrt(outside[i]);
    const insideDist = Math.sqrt(inside[i]);
    values[i] = (insideDist - outsideDist) / scale;
  }
  return {
    width,
    height,
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    values,
  };
};

export const fitVectorPath = (
  mask: Uint8Array,
  width: number,
  height: number,
  options?: VectorFitOptions
): Point[] => {
  const polygon = maskToPolygon(mask, width, height, { minX: 0, minY: 0, maxX: 1, maxY: 1 });
  if (polygon.length === 0) {
    return [];
  }
  const tolerance = clamp(options?.simplifyTolerance ?? 0.0025, 0.0001, 0.01);
  return simplifyDouglasPeucker(polygon, tolerance);
};

export class SegmentationWorker {
  private image: Uint8ClampedArray | Uint8Array | null = null;

  private width = 0;

  private height = 0;

  private pyramid: CostPyramid | null = null;

  constructor(private readonly options?: CostPyramidOptions) {}

  loadImage(image: Uint8ClampedArray | Uint8Array, width: number, height: number) {
    this.image = image;
    this.width = width;
    this.height = height;
    this.pyramid = buildCostPyramid(image, width, height, this.options);
  }

  ensureImage() {
    if (!this.image) {
      throw new Error('Segmentation worker has no source image loaded');
    }
  }

  ensurePyramid() {
    if (!this.pyramid) {
      this.ensureImage();
      this.pyramid = buildCostPyramid(this.image!, this.width, this.height, this.options);
    }
  }

  async liveWire(start: Point, end: Point, options?: LiveWireOptions): Promise<Point[]> {
    this.ensurePyramid();
    return traceLiveWire(this.pyramid!, start, end, options);
  }

  async smartWand(seed: Point, options?: SmartWandOptions): Promise<SmartWandResult> {
    this.ensureImage();
    return smartWand(this.image!, this.width, this.height, seed, options);
  }

  async signedDistanceFromMask(mask: Uint8Array): Promise<SignedDistanceField> {
    if (!this.width || !this.height) {
      throw new Error('Segmentation worker is missing image dimensions');
    }
    return computeSignedDistanceField(mask, this.width, this.height);
  }

  async vectorFromMask(mask: Uint8Array, options?: VectorFitOptions): Promise<Point[]> {
    if (!this.width || !this.height) {
      throw new Error('Segmentation worker is missing image dimensions');
    }
    return fitVectorPath(mask, this.width, this.height, options);
  }

  getCostPyramid(): CostPyramid | null {
    return this.pyramid;
  }
}

export const createSegmentationWorker = (options?: CostPyramidOptions) => new SegmentationWorker(options);

