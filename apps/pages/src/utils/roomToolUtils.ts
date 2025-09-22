import type { EdgeMap } from './imageProcessing';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface RasterImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const applyBrushToMask = (
  mask: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number
) => {
  if (!mask || width <= 0 || height <= 0 || radius <= 0) return;
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  const radiusSquared = radius * radius;
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - centerY;
    const dxLimit = Math.sqrt(Math.max(radiusSquared - dy * dy, 0));
    const minX = Math.max(0, Math.floor(centerX - dxLimit));
    const maxX = Math.min(width - 1, Math.ceil(centerX + dxLimit));
    for (let x = minX; x <= maxX; x += 1) {
      mask[y * width + x] = 1;
    }
  }
};

export const rasterizePolygonToMask = (
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number
) => {
  const mask = new Uint8Array(width * height);
  if (points.length < 3 || width <= 0 || height <= 0) {
    return mask;
  }
  const pixels = points.map((point) => ({
    x: clamp(point.x, 0, 1) * (width - 1),
    y: clamp(point.y, 0, 1) * (height - 1),
  }));
  for (let y = 0; y < height; y += 1) {
    const intersections: number[] = [];
    for (let i = 0, j = pixels.length - 1; i < pixels.length; j = i, i += 1) {
      const ay = pixels[i].y;
      const by = pixels[j].y;
      const ax = pixels[i].x;
      const bx = pixels[j].x;
      const intersects = (ay <= y && by > y) || (by <= y && ay > y);
      if (!intersects) continue;
      const ratio = (y - ay) / (by - ay + Number.EPSILON);
      const x = ax + (bx - ax) * ratio;
      intersections.push(x);
    }
    intersections.sort((a, b) => a - b);
    for (let index = 0; index < intersections.length; index += 2) {
      const start = Math.max(0, Math.floor(intersections[index]));
      const end = Math.min(width - 1, Math.ceil(intersections[index + 1] ?? intersections[index]));
      for (let x = start; x <= end; x += 1) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
};

export const dilateMask = (mask: Uint8Array, width: number, height: number, radius: number) => {
  if (!mask || width <= 0 || height <= 0 || radius <= 0) {
    return mask;
  }
  const result = new Uint8Array(mask); // copy existing mask
  const radiusCeil = Math.max(1, Math.ceil(radius));
  const radiusSquared = radius * radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const minY = Math.max(0, y - radiusCeil);
      const maxY = Math.min(height - 1, y + radiusCeil);
      for (let ny = minY; ny <= maxY; ny += 1) {
        const dy = ny - y;
        const dxLimit = Math.sqrt(Math.max(radiusSquared - dy * dy, 0));
        const minX = Math.max(0, Math.floor(x - dxLimit));
        const maxX = Math.min(width - 1, Math.ceil(x + dxLimit));
        for (let nx = minX; nx <= maxX; nx += 1) {
          result[ny * width + nx] = 1;
        }
      }
    }
  }
  return result;
};

interface Point {
  x: number;
  y: number;
}

const pointKey = (point: Point) => `${point.x},${point.y}`;

const computePolygonArea = (points: Point[]) => {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
};

export const extractLargestPolygonFromMask = (
  mask: Uint8Array,
  width: number,
  height: number
): Array<{ x: number; y: number }> => {
  if (!mask || width <= 0 || height <= 0) return [];

  const inside = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return mask[y * width + x];
  };

  interface Edge {
    start: Point;
    end: Point;
  }

  const edges: Edge[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) {
        edges.push({ start: { x, y }, end: { x: x + 1, y } });
      }
      if (!inside(x + 1, y)) {
        edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 } });
      }
      if (!inside(x, y + 1)) {
        edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 } });
      }
      if (!inside(x - 1, y)) {
        edges.push({ start: { x, y: y + 1 }, end: { x, y } });
      }
    }
  }

  if (edges.length === 0) {
    return [];
  }

  const adjacency = new Map<string, Array<{ edgeIndex: number; end: Point }>>();
  edges.forEach((edge, index) => {
    const key = pointKey(edge.start);
    const bucket = adjacency.get(key);
    if (bucket) {
      bucket.push({ edgeIndex: index, end: edge.end });
    } else {
      adjacency.set(key, [{ edgeIndex: index, end: edge.end }]);
    }
  });

  const used = new Array<boolean>(edges.length).fill(false);
  const loops: Point[][] = [];

  for (let startIndex = 0; startIndex < edges.length; startIndex += 1) {
    if (used[startIndex]) continue;
    const loop: Point[] = [];
    let currentEdgeIndex = startIndex;
    const startEdge = edges[startIndex];
    const startKey = pointKey(startEdge.start);
    let safeguard = edges.length * 4;

    while (safeguard > 0) {
      safeguard -= 1;
      const edge = edges[currentEdgeIndex];
      if (used[currentEdgeIndex]) break;
      used[currentEdgeIndex] = true;
      loop.push(edge.start);
      const nextKey = pointKey(edge.end);
      if (nextKey === startKey) {
        loop.push(edge.end);
        break;
      }
      const candidates = adjacency.get(nextKey);
      if (!candidates) break;
      let nextEdge: { edgeIndex: number; end: Point } | null = null;
      for (const candidate of candidates) {
        if (!used[candidate.edgeIndex]) {
          nextEdge = candidate;
          break;
        }
      }
      if (!nextEdge) break;
      currentEdgeIndex = nextEdge.edgeIndex;
    }

    if (loop.length >= 3) {
      // Remove duplicate trailing point if it matches the first entry.
      if (loop.length > 1) {
        const first = loop[0];
        const last = loop[loop.length - 1];
        if (first.x === last.x && first.y === last.y) {
          loop.pop();
        }
      }
      // Remove immediate duplicates.
      const filtered: Point[] = [];
      for (const point of loop) {
        const prev = filtered[filtered.length - 1];
        if (!prev || prev.x !== point.x || prev.y !== point.y) {
          filtered.push(point);
        }
      }
      if (filtered.length >= 3) {
        loops.push(filtered);
      }
    }
  }

  if (loops.length === 0) {
    return [];
  }

  loops.sort((a, b) => Math.abs(computePolygonArea(b)) - Math.abs(computePolygonArea(a)));
  const best = loops[0];
  const area = computePolygonArea(best);
  const oriented = area < 0 ? [...best].reverse() : best;

  return oriented.map((point) => ({
    x: point.x / width,
    y: point.y / height,
  }));
};

export interface FloodFillOptions {
  colorTolerance?: number;
  gradientThreshold?: number;
  maxPixels?: number;
}

export interface FloodFillResult {
  mask: Uint8Array;
  count: number;
}

const computeColorDistance = (
  data: Uint8ClampedArray,
  index: number,
  base: [number, number, number]
) => {
  const offset = index * 4;
  const dr = data[offset] - base[0];
  const dg = data[offset + 1] - base[1];
  const db = data[offset + 2] - base[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

export const floodFillRoomMask = (
  raster: RasterImageData,
  edgeMap: EdgeMap | null,
  startX: number,
  startY: number,
  options: FloodFillOptions = {}
): FloodFillResult | null => {
  const { width, height, data } = raster;
  if (width <= 0 || height <= 0) return null;
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return null;

  const startIndex = startY * width + startX;
  const totalPixels = width * height;
  const visited = new Uint8Array(totalPixels);
  const mask = new Uint8Array(totalPixels);
  const baseColor: [number, number, number] = [
    data[startIndex * 4],
    data[startIndex * 4 + 1],
    data[startIndex * 4 + 2],
  ];

  const colorTolerance = options.colorTolerance ?? 42;
  const gradientThreshold = options.gradientThreshold ?? (edgeMap ? edgeMap.maxMagnitude * 0.32 : Infinity);
  const maxPixels = options.maxPixels ?? Math.max(512, Math.floor(totalPixels * 0.55));

  const queue = new Uint32Array(totalPixels);
  let head = 0;
  let tail = 0;
  queue[tail] = startIndex;
  tail += 1;
  let filled = 0;

  const push = (index: number) => {
    if (visited[index]) return;
    queue[tail] = index;
    tail += 1;
  };

  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (visited[index]) continue;
    visited[index] = 1;

    const gradient = edgeMap ? edgeMap.magnitudes[index] : 0;
    if (gradient > gradientThreshold) {
      continue;
    }

    const colorDistance = computeColorDistance(data, index, baseColor);
    if (colorDistance > colorTolerance) {
      continue;
    }

    mask[index] = 1;
    filled += 1;
    if (filled >= maxPixels) {
      break;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors: Array<[number, number]> = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const neighborIndex = ny * width + nx;
      if (visited[neighborIndex]) continue;
      if (edgeMap && edgeMap.magnitudes[neighborIndex] > gradientThreshold) continue;
      push(neighborIndex);
    }
  }

  if (filled < 4) {
    return null;
  }

  return { mask, count: filled };
};
