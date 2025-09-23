export type Point = { x: number; y: number };

export interface GapMarker {
  id: string;
  position: Point;
  radius: number;
  severity: 'info' | 'warning' | 'error';
  description: string;
}

export interface SignedDistanceField {
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  values: Float32Array;
}

export interface RoundTripResult {
  sdf: SignedDistanceField;
  polygon: Point[];
  error: number;
}

export interface SdfOptions {
  resolution?: number;
  padding?: number;
}

export interface RoundTripOptions extends SdfOptions {
  threshold?: number;
}

export interface DefineRoomsState {
  mode: 'idle' | 'editing';
  polygon: Point[];
  preview: Point[] | null;
  samples: Point[];
  brushRadius: number;
  snapStrength: number;
  busyMessage: string | null;
  gapMarkers: GapMarker[];
  signedDistanceField: SignedDistanceField | null;
  vectorDraft: Point[] | null;
  lastRoundTrip: RoundTripResult | null;
  lastUpdated: number;
}

export type DefineRoomsListener = (state: DefineRoomsState) => void;

export interface DefineRoomsStore {
  getState(): DefineRoomsState;
  subscribe(listener: DefineRoomsListener): () => void;
  setMode(mode: DefineRoomsState['mode']): void;
  setBusy(message: string | null): void;
  setBrushRadius(radius: number): void;
  setSnapStrength(strength: number): void;
  setPolygon(polygon: Point[]): void;
  previewPolygon(polygon: Point[] | null): void;
  commitPolygon(polygon: Point[]): void;
  setSamples(samples: Point[]): void;
  applyBrushSample(point: Point, mode: 'add' | 'erase'): void;
  clear(): void;
  setGapMarkers(markers: GapMarker[]): void;
  refreshGapMarkers(): void;
  setSignedDistanceField(field: SignedDistanceField | null): void;
  setVectorDraft(polygon: Point[] | null): void;
  roundTrip(polygon: Point[], options?: RoundTripOptions): RoundTripResult;
  vectorToSdf(polygon: Point[], options?: SdfOptions): SignedDistanceField;
  sdfToVector(field: SignedDistanceField, threshold?: number): Point[];
  snapPoint(point: Point): Point;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const nearlyEqual = (a: number, b: number, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;

const pointKey = (point: Point) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;

const dedupePoints = (points: Point[]) => {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = pointKey(point);
    if (seen.has(key)) {
      return false;
    }
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

  const simplifyDPStep = (pointsToSimplify: Point[], first: number, last: number, simplified: Point[]) => {
    let maxSqDist = sqTolerance;
    let index = -1;

    for (let i = first + 1; i < last; i += 1) {
      const sqDist = sqDistanceToSegment(pointsToSimplify[i], pointsToSimplify[first], pointsToSimplify[last]);
      if (sqDist > maxSqDist) {
        index = i;
        maxSqDist = sqDist;
      }
    }

    if (index !== -1) {
      if (index - first > 1) {
        simplifyDPStep(pointsToSimplify, first, index, simplified);
      }
      simplified.push(pointsToSimplify[index]);
      if (last - index > 1) {
        simplifyDPStep(pointsToSimplify, index, last, simplified);
      }
    }
  };

  const last = points.length - 1;
  const result = [points[0]];
  simplifyDPStep(points, 0, last, result);
  result.push(points[last]);
  return result;
};

const pointInPolygon = (point: Point, polygon: Point[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const distanceToSegment = (point: Point, a: Point, b: Point) => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = point.x - a.x;
  const wy = point.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) {
    return Math.hypot(point.x - b.x, point.y - b.y);
  }
  const t = c1 / c2;
  const px = a.x + vx * t;
  const py = a.y + vy * t;
  return Math.hypot(point.x - px, point.y - py);
};

const ensureBounds = (polygon: Point[]) => {
  if (polygon.length === 0) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  let minX = polygon[0].x;
  let minY = polygon[0].y;
  let maxX = polygon[0].x;
  let maxY = polygon[0].y;
  for (const point of polygon) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const padding = Math.max(width, height) * 0.05;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
};

const defaultState: DefineRoomsState = {
  mode: 'idle',
  polygon: [],
  preview: null,
  samples: [],
  brushRadius: 0.08,
  snapStrength: 0.65,
  busyMessage: null,
  gapMarkers: [],
  signedDistanceField: null,
  vectorDraft: null,
  lastRoundTrip: null,
  lastUpdated: Date.now(),
};

let state: DefineRoomsState = { ...defaultState };

const listeners = new Set<DefineRoomsListener>();

const notify = () => {
  listeners.forEach((listener) => listener(state));
};

const commitState = (updater: (current: DefineRoomsState) => DefineRoomsState) => {
  state = { ...updater(state), lastUpdated: Date.now() };
  notify();
};

const generateBrushSamples = (center: Point, radius: number, segments = 16) => {
  const samples: Point[] = [];
  samples.push(center);
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    samples.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return samples;
};

const computeGapMarkers = (polygon: Point[]) => {
  if (polygon.length < 2) {
    return [] as GapMarker[];
  }
  const markers: GapMarker[] = [];
  const threshold = 0.075;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const gap = distance(current, next);
    if (gap <= threshold) {
      continue;
    }
    const radius = gap / 2;
    const severity = gap > threshold * 1.6 ? 'error' : gap > threshold * 1.2 ? 'warning' : 'info';
    markers.push({
      id: `gap-${i}`,
      position: { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
      radius,
      severity,
      description: `Gap of ${(gap * 100).toFixed(1)}% between segments`,
    });
  }
  return markers;
};

const rasterizePolygon = (polygon: Point[], width: number, height: number, bounds: SignedDistanceField['bounds']) => {
  const mask = new Uint8Array(width * height);
  if (polygon.length === 0) {
    return mask;
  }
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const worldPoint = {
        x: bounds.minX + ((x + 0.5) / width) * scaleX,
        y: bounds.minY + ((y + 0.5) / height) * scaleY,
      };
      if (pointInPolygon(worldPoint, polygon)) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
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

  const cases: Record<number, Array<[Point, Point]>> = {
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
      if (key === 0 || key === 15) {
        continue;
      }
      const template = cases[key];
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

  const equals = (a: Point, b: Point) => nearlyEqual(a.x, b.x, 1e-4) && nearlyEqual(a.y, b.y, 1e-4);

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

const convertMaskToPolygon = (mask: Uint8Array, width: number, height: number, bounds: SignedDistanceField['bounds']) => {
  const rawPolygon = marchingSquares(mask, width, height);
  if (rawPolygon.length === 0) {
    return [];
  }
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  const widthDenominator = width - 1 || 1;
  const heightDenominator = height - 1 || 1;
  const polygon = rawPolygon.map((point) => ({
    x: bounds.minX + (point.x / widthDenominator) * scaleX,
    y: bounds.minY + (point.y / heightDenominator) * scaleY,
  }));
  return simplifyDouglasPeucker(dedupePoints(polygon), 0.001);
};

const averageDistanceBetweenPolygons = (a: Point[], b: Point[]) => {
  if (a.length === 0 || b.length === 0) {
    return 1;
  }
  const sampleCount = Math.min(a.length, 256);
  let total = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const index = Math.floor((i / sampleCount) * a.length);
    const point = a[index];
    let closest = Infinity;
    for (const other of b) {
      const d = distance(point, other);
      if (d < closest) {
        closest = d;
      }
    }
    total += closest;
  }
  return total / sampleCount;
};

const vectorToSdf = (polygon: Point[], options?: SdfOptions): SignedDistanceField => {
  const bounds = ensureBounds(polygon);
  const resolution = clamp(options?.resolution ?? 128, 16, 1024);
  const padding = options?.padding ?? 0;
  const width = Math.max(8, Math.round((bounds.maxX - bounds.minX + padding) * resolution));
  const height = Math.max(8, Math.round((bounds.maxY - bounds.minY + padding) * resolution));
  const adjustedBounds = {
    minX: bounds.minX - padding / 2,
    minY: bounds.minY - padding / 2,
    maxX: bounds.maxX + padding / 2,
    maxY: bounds.maxY + padding / 2,
  };
  const values = new Float32Array(width * height);
  const mask = rasterizePolygon(polygon, width, height, adjustedBounds);

  const scaleX = adjustedBounds.maxX - adjustedBounds.minX || 1;
  const scaleY = adjustedBounds.maxY - adjustedBounds.minY || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const worldPoint = {
        x: adjustedBounds.minX + ((x + 0.5) / width) * scaleX,
        y: adjustedBounds.minY + ((y + 0.5) / height) * scaleY,
      };
      let minDist = Infinity;
      for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const dist = distanceToSegment(worldPoint, a, b);
        if (dist < minDist) {
          minDist = dist;
        }
      }
      const inside = mask[y * width + x] > 0;
      values[y * width + x] = inside ? -minDist : minDist;
    }
  }

  return {
    width,
    height,
    bounds: adjustedBounds,
    values,
  };
};

const sdfToVector = (field: SignedDistanceField, threshold = 0) => {
  const mask = new Uint8Array(field.width * field.height);
  for (let i = 0; i < field.values.length; i += 1) {
    mask[i] = field.values[i] <= threshold ? 1 : 0;
  }
  return convertMaskToPolygon(mask, field.width, field.height, field.bounds);
};

const roundTripPolygon = (polygon: Point[], options?: RoundTripOptions): RoundTripResult => {
  const sdf = vectorToSdf(polygon, options);
  const reconstructed = sdfToVector(sdf, options?.threshold ?? 0);
  const error = averageDistanceBetweenPolygons(polygon, reconstructed);
  return { sdf, polygon: reconstructed, error };
};

export const defineRoomsStore: DefineRoomsStore = {
  getState: () => state,
  subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },
  setMode(mode) {
    commitState((current) => ({ ...current, mode }));
  },
  setBusy(message) {
    commitState((current) => ({ ...current, busyMessage: message }));
  },
  setBrushRadius(radius) {
    const next = clamp(radius, 0.01, 0.5);
    commitState((current) => ({ ...current, brushRadius: next }));
  },
  setSnapStrength(strength) {
    commitState((current) => ({ ...current, snapStrength: clamp(strength, 0, 1) }));
  },
  setPolygon(polygon) {
    const deduped = dedupePoints(polygon);
    const simplified = simplifyDouglasPeucker(deduped, 0.0005);
    commitState((current) => ({
      ...current,
      polygon: simplified,
      samples: simplified.slice(),
      preview: null,
      gapMarkers: computeGapMarkers(simplified),
      lastRoundTrip: null,
    }));
  },
  previewPolygon(polygon) {
    commitState((current) => ({ ...current, preview: polygon ? polygon.slice() : null }));
  },
  commitPolygon(polygon) {
    const deduped = dedupePoints(polygon);
    const simplified = simplifyDouglasPeucker(deduped, 0.0005);
    commitState((current) => ({
      ...current,
      mode: 'editing',
      polygon: simplified,
      samples: simplified.slice(),
      preview: null,
      gapMarkers: computeGapMarkers(simplified),
      lastRoundTrip: null,
    }));
  },
  setSamples(samples) {
    const deduped = dedupePoints(samples);
    commitState((current) => ({
      ...current,
      samples: deduped,
      polygon: deduped.slice(),
      preview: null,
      gapMarkers: computeGapMarkers(deduped),
      lastRoundTrip: null,
    }));
  },
  applyBrushSample(point, mode) {
    commitState((current) => {
      const snapped = defineRoomsStore.snapPoint(point);
      const radius = current.brushRadius;
      const samples = [...current.samples];
      if (mode === 'add') {
        const additions = generateBrushSamples(snapped, radius);
        for (const sample of additions) {
          samples.push(sample);
        }
      } else {
        const filtered = samples.filter((sample) => distance(sample, snapped) > radius * 0.6);
        samples.length = 0;
        samples.push(...filtered);
      }
      const deduped = dedupePoints(samples);
      const simplified = simplifyDouglasPeucker(deduped, 0.0005);
      return {
        ...current,
        samples: deduped,
        polygon: simplified,
        preview: null,
        gapMarkers: computeGapMarkers(simplified),
        lastRoundTrip: null,
      };
    });
  },
  clear() {
    commitState(() => ({ ...defaultState, lastUpdated: Date.now() }));
  },
  setGapMarkers(markers) {
    commitState((current) => ({ ...current, gapMarkers: markers.slice() }));
  },
  refreshGapMarkers() {
    commitState((current) => ({ ...current, gapMarkers: computeGapMarkers(current.polygon) }));
  },
  setSignedDistanceField(field) {
    commitState((current) => ({ ...current, signedDistanceField: field }));
  },
  setVectorDraft(polygon) {
    commitState((current) => ({ ...current, vectorDraft: polygon ? polygon.slice() : null }));
  },
  roundTrip(polygon, options) {
    const result = roundTripPolygon(polygon, options);
    commitState((current) => ({ ...current, signedDistanceField: result.sdf, vectorDraft: result.polygon, lastRoundTrip: result }));
    return result;
  },
  vectorToSdf,
  sdfToVector,
  snapPoint(point) {
    const strength = clamp(state.snapStrength, 0, 1);
    const resolution = clamp(Math.round(12 + strength * 20), 6, 64);
    return {
      x: clamp(Math.round(point.x * resolution) / resolution, 0, 1),
      y: clamp(Math.round(point.y * resolution) / resolution, 0, 1),
    };
  },
};

