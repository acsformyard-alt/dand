import { dilateMask, rasterizePolygonToMask } from './roomToolUtils';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface MaskSDF {
  band: Float32Array;
  w: number;
  h: number;
  stride: number;
  bandRadius: number;
  origin: { x: number; y: number };
}

export interface VecPath {
  points: Array<{ x: number; y: number }>;
  closed: true;
}

interface NormalizedPath {
  points: Array<{ x: number; y: number }>;
  closed?: boolean;
}

interface PathToSdfOptions {
  width: number;
  height: number;
  bandRadius?: number;
  offsetPx?: number;
  closePath?: boolean;
}

interface SdfToPathOptions {
  smoothingIterations?: number;
  smoothingFactor?: number;
  simplifyTolerance?: number;
}

const DEFAULT_BAND_RADIUS = 48;

export const createEmptySdf = (
  width: number,
  height: number,
  bandRadius: number = DEFAULT_BAND_RADIUS
): MaskSDF => {
  const stride = width;
  const band = new Float32Array(stride * height);
  band.fill(bandRadius);
  return {
    band,
    w: width,
    h: height,
    stride,
    bandRadius,
    origin: { x: 0, y: 0 },
  } satisfies MaskSDF;
};

const ensureClosedPath = (points: Array<{ x: number; y: number }>) => {
  if (points.length === 0) {
    return points;
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) {
    return points;
  }
  return [...points, { ...first }];
};

const buildChamferDistance = (mask: Uint8Array, width: number, height: number) => {
  const dist = new Float32Array(width * height);
  const stride = width;
  const INF = 1e6;
  for (let i = 0; i < dist.length; i += 1) {
    dist[i] = mask[i] ? 0 : INF;
  }
  const SQRT2 = Math.SQRT2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * stride + x;
      const current = dist[index];
      if (current === 0) continue;
      let best = current;
      if (x > 0) {
        best = Math.min(best, dist[index - 1] + 1);
      }
      if (y > 0) {
        best = Math.min(best, dist[index - stride] + 1);
      }
      if (x > 0 && y > 0) {
        best = Math.min(best, dist[index - stride - 1] + SQRT2);
      }
      if (x < width - 1 && y > 0) {
        best = Math.min(best, dist[index - stride + 1] + SQRT2);
      }
      dist[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * stride + x;
      const current = dist[index];
      if (current === 0) continue;
      let best = current;
      if (x < width - 1) {
        best = Math.min(best, dist[index + 1] + 1);
      }
      if (y < height - 1) {
        best = Math.min(best, dist[index + stride] + 1);
      }
      if (x < width - 1 && y < height - 1) {
        best = Math.min(best, dist[index + stride + 1] + SQRT2);
      }
      if (x > 0 && y < height - 1) {
        best = Math.min(best, dist[index + stride - 1] + SQRT2);
      }
      dist[index] = best;
    }
  }
  return dist;
};

export const pathToSDF = (
  path: NormalizedPath,
  options: PathToSdfOptions
): MaskSDF => {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const bandRadius = options.bandRadius ?? DEFAULT_BAND_RADIUS;
  const points = ensureClosedPath(path.points.map((point) => ({
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  })));
  const mask = rasterizePolygonToMask(points, width, height);
  const offset = Math.max(0, options.offsetPx ?? 0);
  const workingMask = offset > 0 ? dilateMask(mask, width, height, offset) : mask;
  const inside = buildChamferDistance(workingMask, width, height);
  const inverted = new Uint8Array(workingMask.length);
  for (let i = 0; i < workingMask.length; i += 1) {
    inverted[i] = workingMask[i] ? 0 : 1;
  }
  const outside = buildChamferDistance(inverted, width, height);
  const sdf = createEmptySdf(width, height, bandRadius);
  for (let index = 0; index < sdf.band.length; index += 1) {
    const value = inside[index] - outside[index];
    sdf.band[index] = clamp(value, -bandRadius, bandRadius);
  }
  return sdf;
};

const distancePointToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) => {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-12) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = clamp((apx * abx + apy * aby) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
};

const distanceToPolyline = (
  px: number,
  py: number,
  points: Array<{ x: number; y: number }>
) => {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    const point = points[0];
    return Math.hypot(px - point.x, py - point.y);
  }
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const distance = distancePointToSegment(px, py, a.x, a.y, b.x, b.y);
    if (distance < best) {
      best = distance;
    }
  }
  return best;
};

const computeStrokeBounds = (
  points: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  radius: number
) => {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  points.forEach((point) => {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }
  const expansion = radius + 2;
  return {
    minX: clamp(Math.floor(minX - expansion), 0, width - 1),
    minY: clamp(Math.floor(minY - expansion), 0, height - 1),
    maxX: clamp(Math.ceil(maxX + expansion), 0, width - 1),
    maxY: clamp(Math.ceil(maxY + expansion), 0, height - 1),
  };
};

const toPixelPolyline = (
  sdf: MaskSDF,
  stroke: Array<{ x: number; y: number }>
) =>
  stroke.map((point) => ({
    x: clamp(point.x, 0, 1) * (sdf.w - 1),
    y: clamp(point.y, 0, 1) * (sdf.h - 1),
  }));

export const applyBrushAdd = (
  sdf: MaskSDF,
  stroke: Array<{ x: number; y: number }>,
  radius: number
) => {
  if (!sdf || stroke.length === 0 || radius <= 0) return;
  const polyline = toPixelPolyline(sdf, stroke);
  const bounds = computeStrokeBounds(polyline, sdf.w, sdf.h, radius);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const distance = distanceToPolyline(x + 0.5, y + 0.5, polyline);
      if (!Number.isFinite(distance)) continue;
      const index = y * sdf.stride + x;
      const next = Math.min(sdf.band[index], distance - radius);
      sdf.band[index] = clamp(next, -sdf.bandRadius, sdf.bandRadius);
    }
  }
};

export const applyBrushErase = (
  sdf: MaskSDF,
  stroke: Array<{ x: number; y: number }>,
  radius: number
) => {
  if (!sdf || stroke.length === 0 || radius <= 0) return;
  const polyline = toPixelPolyline(sdf, stroke);
  const bounds = computeStrokeBounds(polyline, sdf.w, sdf.h, radius);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const distance = distanceToPolyline(x + 0.5, y + 0.5, polyline);
      if (!Number.isFinite(distance)) continue;
      const index = y * sdf.stride + x;
      const next = Math.max(sdf.band[index], radius - distance);
      sdf.band[index] = clamp(next, -sdf.bandRadius, sdf.bandRadius);
    }
  }
};

export const writeBarrier = (
  sdf: MaskSDF,
  polyline: Array<{ x: number; y: number }>,
  width: number
) => {
  if (!sdf || polyline.length === 0 || width <= 0) return;
  const pixelPolyline = toPixelPolyline(sdf, polyline);
  const bounds = computeStrokeBounds(pixelPolyline, sdf.w, sdf.h, width / 2);
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const distance = distanceToPolyline(x + 0.5, y + 0.5, pixelPolyline);
      if (distance <= width / 2) {
        const index = y * sdf.stride + x;
        sdf.band[index] = Math.max(0, Math.min(sdf.bandRadius, distance));
      }
    }
  }
};

const pointKey = (point: { x: number; y: number }) => `${Math.round(point.x * 4096)}:${Math.round(point.y * 4096)}`;

const pointsAlmostEqual = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;

const marchingSquares = (sdf: MaskSDF) => {
  const segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> = [];
  const stride = sdf.stride;
  const values = sdf.band;
  const interpolate = (
    ax: number,
    ay: number,
    av: number,
    bx: number,
    by: number,
    bv: number
  ) => {
    const denom = av - bv;
    if (Math.abs(denom) < 1e-6) {
      return { x: ax, y: ay };
    }
    const t = av / denom;
    return {
      x: ax + (bx - ax) * t,
      y: ay + (by - ay) * t,
    };
  };
  for (let y = 0; y < sdf.h - 1; y += 1) {
    for (let x = 0; x < sdf.w - 1; x += 1) {
      const index = y * stride + x;
      const tl = values[index];
      const tr = values[index + 1];
      const bl = values[index + stride];
      const br = values[index + stride + 1];
      const caseIndex = (tl < 0 ? 1 : 0) | (tr < 0 ? 2 : 0) | (br < 0 ? 4 : 0) | (bl < 0 ? 8 : 0);
      if (caseIndex === 0 || caseIndex === 15) continue;
      const top = interpolate(x, y, tl, x + 1, y, tr);
      const right = interpolate(x + 1, y, tr, x + 1, y + 1, br);
      const bottom = interpolate(x, y + 1, bl, x + 1, y + 1, br);
      const left = interpolate(x, y, tl, x, y + 1, bl);
      switch (caseIndex) {
        case 1:
        case 14:
          segments.push({ start: left, end: top });
          break;
        case 2:
        case 13:
          segments.push({ start: top, end: right });
          break;
        case 3:
        case 12:
          segments.push({ start: left, end: right });
          break;
        case 4:
        case 11:
          segments.push({ start: right, end: bottom });
          break;
        case 5: {
          segments.push({ start: top, end: right });
          segments.push({ start: left, end: bottom });
          break;
        }
        case 6:
        case 9:
          segments.push({ start: top, end: bottom });
          break;
        case 7:
        case 8:
          segments.push({ start: bottom, end: left });
          break;
        case 10: {
          segments.push({ start: top, end: left });
          segments.push({ start: right, end: bottom });
          break;
        }
        default:
          break;
      }
    }
  }
  return segments;
};

const traceLargestLoop = (segments: Array<{ start: { x: number; y: number }; end: { x: number; y: number } }>) => {
  const adjacency = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    const startKey = pointKey(segment.start);
    const endKey = pointKey(segment.end);
    if (!adjacency.has(startKey)) adjacency.set(startKey, []);
    if (!adjacency.has(endKey)) adjacency.set(endKey, []);
    adjacency.get(startKey)!.push(index);
    adjacency.get(endKey)!.push(index);
  });
  const used = new Array<boolean>(segments.length).fill(false);
  let bestLoop: Array<{ x: number; y: number }> = [];
  const polygonArea = (points: Array<{ x: number; y: number }>) => {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }
    return Math.abs(area) / 2;
  };
  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    if (used[startIndex]) continue;
    const segment = segments[startIndex];
    let loop: Array<{ x: number; y: number }> = [segment.start];
    let currentPoint = segment.end;
    used[startIndex] = true;
    let safeguard = segments.length * 4;
    while (safeguard > 0) {
      safeguard -= 1;
      loop.push(currentPoint);
      const key = pointKey(currentPoint);
      const neighbors = adjacency.get(key) ?? [];
      let nextIndex = -1;
      for (const candidate of neighbors) {
        if (used[candidate]) continue;
        nextIndex = candidate;
        break;
      }
      if (nextIndex === -1) {
        break;
      }
      used[nextIndex] = true;
      const nextSegment = segments[nextIndex];
      if (pointsAlmostEqual(nextSegment.start, currentPoint)) {
        currentPoint = nextSegment.end;
      } else {
        currentPoint = nextSegment.start;
      }
      if (loop.length > 2 && pointsAlmostEqual(currentPoint, loop[0])) {
        loop[loop.length - 1] = loop[0];
        break;
      }
    }
    if (loop.length > 3 && polygonArea(loop) > polygonArea(bestLoop)) {
      bestLoop = loop;
    }
  }
  return bestLoop;
};

const simplifyPath = (
  points: Array<{ x: number; y: number }>,
  tolerance: number
) => {
  if (points.length < 3) return points;
  const perpendicularDistance = (
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ) => {
    const area =
      Math.abs(
        0.5 *
          (lineStart.x * lineEnd.y + lineEnd.x * point.y + point.x * lineStart.y - lineEnd.x * lineStart.y - point.x * lineEnd.y - lineStart.x * point.y)
      );
    const base = Math.hypot(lineEnd.x - lineStart.x, lineEnd.y - lineStart.y) || Number.EPSILON;
    return (area * 2) / base;
  };
  const rdp = (pts: Array<{ x: number; y: number }>, epsilon: number) => {
    if (pts.length < 3) return pts;
    let maxDistance = 0;
    let index = 0;
    const last = pts.length - 1;
    for (let i = 1; i < last; i += 1) {
      const distance = perpendicularDistance(pts[i], pts[0], pts[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (maxDistance > epsilon) {
      const left = rdp(pts.slice(0, index + 1), epsilon);
      const right = rdp(pts.slice(index), epsilon);
      return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[last]];
  };
  return rdp(points, tolerance);
};

const smoothPath = (
  points: Array<{ x: number; y: number }>,
  iterations: number,
  factor: number
) => {
  if (points.length < 3 || iterations <= 0 || factor <= 0) {
    return points;
  }
  const result = points.map((point) => ({ ...point }));
  const weight = clamp(factor, 0, 0.45);
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 1; i < result.length - 1; i += 1) {
      const prev = result[i - 1];
      const next = result[i + 1];
      const current = result[i];
      current.x = current.x * (1 - weight * 2) + prev.x * weight + next.x * weight;
      current.y = current.y * (1 - weight * 2) + prev.y * weight + next.y * weight;
    }
  }
  return result;
};

export const sdfToPath = (
  sdf: MaskSDF,
  options: SdfToPathOptions = {}
): VecPath => {
  const segments = marchingSquares(sdf);
  const loop = traceLargestLoop(segments);
  if (loop.length < 3) {
    return { points: [], closed: true };
  }
  const simplified = simplifyPath(loop, options.simplifyTolerance ?? 0.75);
  const smoothed = smoothPath(simplified, options.smoothingIterations ?? 2, options.smoothingFactor ?? 0.2);
  const normalised = smoothed.map((point) => ({
    x: clamp(point.x / Math.max(1, sdf.w - 1), 0, 1),
    y: clamp(point.y / Math.max(1, sdf.h - 1), 0, 1),
  }));
  return { points: normalised, closed: true };
};

