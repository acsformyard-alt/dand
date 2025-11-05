import { Bounds, Point } from '../types/geometry';

export interface RoomMask {
  width: number;
  height: number;
  bounds: Bounds;
  data: Uint8ClampedArray;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

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

export const roomMaskHasCoverage = (mask: RoomMask): boolean => {
  for (let i = 0; i < mask.data.length; i += 1) {
    if (mask.data[i] > 0) {
      return true;
    }
  }
  return false;
};

export const isPointInRoomMask = (mask: RoomMask, point: Point): boolean => {
  const { bounds, width, height, data } = mask;
  if (width <= 0 || height <= 0) {
    return false;
  }
  if (point.x < bounds.minX || point.x > bounds.maxX || point.y < bounds.minY || point.y > bounds.maxY) {
    return false;
  }
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  if (spanX <= 0 || spanY <= 0) {
    return false;
  }
  const normalizedX = (point.x - bounds.minX) / spanX;
  const normalizedY = (point.y - bounds.minY) / spanY;
  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
    return false;
  }
  const pixelX = Math.min(width - 1, Math.max(0, Math.floor(normalizedX * width)));
  const pixelY = Math.min(height - 1, Math.max(0, Math.floor(normalizedY * height)));
  const index = pixelY * width + pixelX;
  return data[index] > 0;
};

export const computeRoomMaskCentroid = (mask: RoomMask): Point => {
  const { width, height, data, bounds } = mask;
  if (width <= 0 || height <= 0) {
    return { x: 0.5, y: 0.5 };
  }
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] > 0) {
        sumX += x + 0.5;
        sumY += y + 0.5;
        count += 1;
      }
    }
  }
  if (count === 0) {
    const centerX = clamp((bounds.minX + bounds.maxX) / 2 || 0.5, 0, 1);
    const centerY = clamp((bounds.minY + bounds.maxY) / 2 || 0.5, 0, 1);
    return { x: centerX, y: centerY };
  }
  const averageX = sumX / count;
  const averageY = sumY / count;
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const normalizedX = averageX / width;
  const normalizedY = averageY / height;
  return {
    x: clamp(bounds.minX + normalizedX * spanX, 0, 1),
    y: clamp(bounds.minY + normalizedY * spanY, 0, 1),
  };
};

export const emptyRoomMask = (): RoomMask => ({
  width: 32,
  height: 32,
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  data: new Uint8ClampedArray(32 * 32),
});
