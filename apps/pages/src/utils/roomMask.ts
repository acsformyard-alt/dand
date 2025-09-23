import { Bounds, Point } from '../types/geometry';

export interface RoomMask {
  width: number;
  height: number;
  bounds: Bounds;
  data: Uint8ClampedArray;
}

export interface RoomMaskOptions {
  resolution?: number;
  bounds?: Bounds;
  padding?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const nearlyEqual = (a: number, b: number, epsilon = 1e-6) => Math.abs(a - b) <= epsilon;

const pointKey = (point: Point) => `${point.x.toFixed(6)}:${point.y.toFixed(6)}`;

const dedupePoints = (points: Point[]) => {
  const seen = new Set<string>();
  const result: Point[] = [];
  for (const point of points) {
    const key = pointKey(point);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(point);
    }
  }
  return result;
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
    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const ensureBounds = (polygon: Point[]): Bounds => {
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
    minX: clamp(minX - padding, 0, 1),
    minY: clamp(minY - padding, 0, 1),
    maxX: clamp(maxX + padding, 0, 1),
    maxY: clamp(maxY + padding, 0, 1),
  };
};

const rasterizePolygon = (polygon: Point[], width: number, height: number, bounds: Bounds) => {
  const mask = new Uint8ClampedArray(width * height);
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
        mask[y * width + x] = 255;
      }
    }
  }
  return mask;
};

const marchingSquares = (mask: Uint8ClampedArray, width: number, height: number) => {
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

export const createRoomMaskFromPolygon = (polygon: Point[], options?: RoomMaskOptions): RoomMask => {
  const resolution = clamp(options?.resolution ?? 256, 16, 1024);
  const padding = options?.padding ?? 0;
  const baseBounds = options?.bounds ?? ensureBounds(polygon);
  const bounds: Bounds = {
    minX: clamp(baseBounds.minX - padding, 0, 1),
    minY: clamp(baseBounds.minY - padding, 0, 1),
    maxX: clamp(baseBounds.maxX + padding, 0, 1),
    maxY: clamp(baseBounds.maxY + padding, 0, 1),
  };
  const width = Math.max(8, Math.round((bounds.maxX - bounds.minX) * resolution));
  const height = Math.max(8, Math.round((bounds.maxY - bounds.minY) * resolution));
  const mask = rasterizePolygon(polygon, width, height, bounds);
  return {
    width,
    height,
    bounds,
    data: mask,
  };
};

export const roomMaskToPolygon = (mask: RoomMask, tolerance = 0.001): Point[] => {
  const raw = marchingSquares(mask.data, mask.width, mask.height);
  if (raw.length === 0) {
    return [];
  }
  const { bounds } = mask;
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  const widthDenominator = mask.width - 1 || 1;
  const heightDenominator = mask.height - 1 || 1;
  const polygon = raw.map((point) => ({
    x: bounds.minX + (point.x / widthDenominator) * scaleX,
    y: bounds.minY + (point.y / heightDenominator) * scaleY,
  }));
  return simplifyDouglasPeucker(dedupePoints(polygon), tolerance);
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array, start = 0, length = data.length) => {
  let c = 0xffffffff;
  for (let i = 0; i < length; i += 1) {
    c = crcTable[(c ^ data[start + i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const adler32 = (data: Uint8Array) => {
  let a = 1;
  let b = 0;
  const MOD_ADLER = 65521;
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return ((b << 16) | a) >>> 0;
};

const writeChunk = (type: string, data: Uint8Array) => {
  const chunk = new Uint8Array(8 + data.length + 4);
  const length = data.length;
  chunk[0] = (length >>> 24) & 0xff;
  chunk[1] = (length >>> 16) & 0xff;
  chunk[2] = (length >>> 8) & 0xff;
  chunk[3] = length & 0xff;
  for (let i = 0; i < 4; i += 1) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  const crc = crc32(chunk, 4, data.length + 4);
  const crcOffset = 8 + data.length;
  chunk[crcOffset] = (crc >>> 24) & 0xff;
  chunk[crcOffset + 1] = (crc >>> 16) & 0xff;
  chunk[crcOffset + 2] = (crc >>> 8) & 0xff;
  chunk[crcOffset + 3] = crc & 0xff;
  return chunk;
};

const buildZlibStream = (data: Uint8Array) => {
  const chunks: number[] = [];
  chunks.push(0x78, 0x01);
  let offset = 0;
  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockSize = Math.min(0xffff, remaining);
    const isFinal = offset + blockSize >= data.length ? 1 : 0;
    chunks.push(isFinal);
    chunks.push(blockSize & 0xff, (blockSize >>> 8) & 0xff);
    const nlen = 0xffff - blockSize;
    chunks.push(nlen & 0xff, (nlen >>> 8) & 0xff);
    for (let i = 0; i < blockSize; i += 1) {
      chunks.push(data[offset + i]);
    }
    offset += blockSize;
  }
  const adler = adler32(data);
  chunks.push((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);
  return new Uint8Array(chunks);
};

const serializeBounds = (bounds: Bounds) => {
  const payload = JSON.stringify(bounds);
  const text = new TextEncoder().encode(`bounds\0${payload}`);
  return text;
};

export const encodeRoomMaskToPngBytes = (mask: RoomMask): Uint8Array => {
  const rows = mask.height;
  const cols = mask.width;
  const raw = new Uint8Array((cols + 1) * rows);
  for (let y = 0; y < rows; y += 1) {
    raw[y * (cols + 1)] = 0; // filter type 0
    for (let x = 0; x < cols; x += 1) {
      raw[y * (cols + 1) + 1 + x] = mask.data[y * cols + x];
    }
  }
  const idat = buildZlibStream(raw);
  const ihdr = new Uint8Array(13);
  ihdr[0] = (cols >>> 24) & 0xff;
  ihdr[1] = (cols >>> 16) & 0xff;
  ihdr[2] = (cols >>> 8) & 0xff;
  ihdr[3] = cols & 0xff;
  ihdr[4] = (rows >>> 24) & 0xff;
  ihdr[5] = (rows >>> 16) & 0xff;
  ihdr[6] = (rows >>> 8) & 0xff;
  ihdr[7] = rows & 0xff;
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [
    writeChunk('IHDR', ihdr),
    writeChunk('tEXt', serializeBounds(mask.bounds)),
    writeChunk('IDAT', idat),
    writeChunk('IEND', new Uint8Array(0)),
  ];
  const totalLength = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  result.set(signature, offset);
  offset += signature.length;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const base64Encode = (bytes: Uint8Array) => {
  if (typeof btoa === 'function') {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return binary;
};

const base64Decode = (input: string) => {
  if (typeof atob === 'function') {
    const binary = atob(input);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(input, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    bytes[i] = input.charCodeAt(i);
  }
  return bytes;
};

export const encodeRoomMaskToDataUrl = (mask: RoomMask) => {
  const pngBytes = encodeRoomMaskToPngBytes(mask);
  const encoded = base64Encode(pngBytes);
  return `data:image/png;base64,${encoded}`;
};

const parseBoundsFromText = (data: Uint8Array): Bounds | null => {
  try {
    const text = new TextDecoder().decode(data);
    const [keyword, value] = text.split('\0');
    if (keyword === 'bounds' && value) {
      const parsed = JSON.parse(value);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof parsed.minX === 'number' &&
        typeof parsed.minY === 'number' &&
        typeof parsed.maxX === 'number' &&
        typeof parsed.maxY === 'number'
      ) {
        return parsed;
      }
    }
  } catch (_error) {
    return null;
  }
  return null;
};

const readUInt32BE = (data: Uint8Array, offset: number) =>
  (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];

const decompressZlib = (data: Uint8Array) => {
  if (data.length < 6) {
    throw new Error('Invalid zlib stream');
  }
  // skip zlib header (2 bytes)
  let offset = 2;
  const chunks: number[] = [];
  while (offset < data.length - 4) {
    const bfinal = data[offset] & 1;
    const btype = (data[offset] >>> 1) & 0x3;
    offset += 1;
    if (btype !== 0) {
      throw new Error('Unsupported compression method');
    }
    const len = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    const nlen = data[offset] | (data[offset + 1] << 8);
    offset += 2;
    if ((len & 0xffff) !== (~nlen & 0xffff)) {
      throw new Error('Corrupted zlib stream');
    }
    for (let i = 0; i < len; i += 1) {
      chunks.push(data[offset + i]);
    }
    offset += len;
    if (bfinal) {
      break;
    }
  }
  return new Uint8Array(chunks);
};

export const decodeRoomMaskFromPngBytes = (pngBytes: Uint8Array): RoomMask => {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) {
    if (pngBytes[i] !== signature[i]) {
      throw new Error('Invalid PNG signature');
    }
  }
  let offset = signature.length;
  let width = 0;
  let height = 0;
  let bounds: Bounds | null = null;
  const idatParts: Uint8Array[] = [];
  while (offset < pngBytes.length) {
    const length = readUInt32BE(pngBytes, offset);
    offset += 4;
    const type = String.fromCharCode(
      pngBytes[offset],
      pngBytes[offset + 1],
      pngBytes[offset + 2],
      pngBytes[offset + 3],
    );
    offset += 4;
    const data = pngBytes.slice(offset, offset + length);
    offset += length;
    offset += 4; // skip CRC
    if (type === 'IHDR') {
      width = readUInt32BE(data, 0);
      height = readUInt32BE(data, 4);
    } else if (type === 'tEXt') {
      bounds = parseBoundsFromText(data) ?? bounds;
    } else if (type === 'IDAT') {
      idatParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (width === 0 || height === 0) {
    throw new Error('PNG missing IHDR data');
  }
  const concatenated = new Uint8Array(idatParts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of idatParts) {
    concatenated.set(part, cursor);
    cursor += part.length;
  }
  const raw = decompressZlib(concatenated);
  const stride = width + 1;
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * stride];
    if (filter !== 0) {
      throw new Error('Unsupported PNG filter');
    }
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = raw[y * stride + 1 + x];
    }
  }
  return {
    width,
    height,
    bounds: bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    data,
  };
};

export const decodeRoomMaskFromDataUrl = (dataUrl: string): RoomMask => {
  const [, encoded] = dataUrl.split(',');
  if (!encoded) {
    throw new Error('Invalid data URL');
  }
  const bytes = base64Decode(encoded);
  return decodeRoomMaskFromPngBytes(bytes);
};

export const cloneRoomMask = (mask: RoomMask): RoomMask => ({
  width: mask.width,
  height: mask.height,
  bounds: { ...mask.bounds },
  data: new Uint8ClampedArray(mask.data),
});

export const applyCircularBrushToMask = (
  mask: RoomMask,
  center: Point,
  radius: number,
  mode: 'add' | 'erase',
  hardness = 1,
): RoomMask => {
  const next = cloneRoomMask(mask);
  const { width, height, bounds } = next;
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  const pixelRadiusX = Math.max(1, Math.round((radius / scaleX) * width));
  const pixelRadiusY = Math.max(1, Math.round((radius / scaleY) * height));
  const centerX = Math.round(((center.x - bounds.minX) / scaleX) * width);
  const centerY = Math.round(((center.y - bounds.minY) / scaleY) * height);
  const clampedHardness = Math.min(Math.max(hardness, 0), 1);
  const falloffStart = clampedHardness;
  const falloffRange = Math.max(1e-6, 1 - falloffStart);
  for (let dy = -pixelRadiusY; dy <= pixelRadiusY; dy += 1) {
    const y = centerY + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -pixelRadiusX; dx <= pixelRadiusX; dx += 1) {
      const x = centerX + dx;
      if (x < 0 || x >= width) continue;
      const distance = Math.sqrt((dx / pixelRadiusX) ** 2 + (dy / pixelRadiusY) ** 2);
      if (distance > 1) {
        continue;
      }
      const index = y * width + x;
      let weight = 1;
      if (distance > falloffStart) {
        weight = Math.max(0, 1 - (distance - falloffStart) / falloffRange);
      }
      const contribution = Math.round(weight * 255);
      if (mode === 'add') {
        next.data[index] = Math.max(next.data[index], contribution);
      } else {
        const remaining = Math.round((next.data[index] * (255 - contribution)) / 255);
        next.data[index] = Math.max(0, remaining);
      }
    }
  }
  return next;
};

export const emptyRoomMask = (): RoomMask => ({
  width: 32,
  height: 32,
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  data: new Uint8ClampedArray(32 * 32),
});
