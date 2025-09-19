export interface ImageDisplayMetrics {
  containerWidth: number;
  containerHeight: number;
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
}

export const computeDisplayMetrics = (
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ImageDisplayMetrics => {
  const containerRatio = containerWidth / (containerHeight || 1);
  const imageRatio = imageWidth / (imageHeight || 1);
  let displayWidth = containerWidth;
  let displayHeight = containerHeight;

  if (containerRatio > imageRatio) {
    displayHeight = containerHeight;
    displayWidth = containerHeight * imageRatio;
  } else {
    displayWidth = containerWidth;
    displayHeight = containerWidth / (imageRatio || 1);
  }

  const offsetX = (containerWidth - displayWidth) / 2;
  const offsetY = (containerHeight - displayHeight) / 2;

  return {
    containerWidth,
    containerHeight,
    imageWidth,
    imageHeight,
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export interface EdgeMap {
  width: number;
  height: number;
  magnitudes: Float32Array;
  maxMagnitude: number;
}

const sobelXKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
const sobelYKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

export const buildEdgeMap = (data: Uint8ClampedArray, width: number, height: number): EdgeMap => {
  const totalPixels = width * height;
  const grayscale = new Float32Array(totalPixels);

  for (let index = 0; index < totalPixels; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    grayscale[index] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const blurred = new Float32Array(totalPixels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const sampleY = clamp(y + ky, 0, height - 1);
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleX = clamp(x + kx, 0, width - 1);
          sum += grayscale[sampleY * width + sampleX];
          count += 1;
        }
      }
      blurred[y * width + x] = sum / (count || 1);
    }
  }

  const magnitudes = new Float32Array(totalPixels);
  let maxMagnitude = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let gx = 0;
      let gy = 0;
      let kernelIndex = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        const sampleY = clamp(y + ky, 0, height - 1);
        for (let kx = -1; kx <= 1; kx += 1) {
          const sampleX = clamp(x + kx, 0, width - 1);
          const value = blurred[sampleY * width + sampleX];
          gx += value * sobelXKernel[kernelIndex];
          gy += value * sobelYKernel[kernelIndex];
          kernelIndex += 1;
        }
      }
      const magnitude = Math.hypot(gx, gy);
      magnitudes[y * width + x] = magnitude;
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
      }
    }
  }

  return { width, height, magnitudes, maxMagnitude };
};

const sampleEdgeMagnitude = (edgeMap: EdgeMap, x: number, y: number) => {
  if (edgeMap.maxMagnitude === 0) return 0;
  const clampedX = clamp(x, 0, edgeMap.width - 1);
  const clampedY = clamp(y, 0, edgeMap.height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, edgeMap.width - 1);
  const y1 = Math.min(y0 + 1, edgeMap.height - 1);
  const tx = clampedX - x0;
  const ty = clampedY - y0;
  const index00 = y0 * edgeMap.width + x0;
  const index10 = y0 * edgeMap.width + x1;
  const index01 = y1 * edgeMap.width + x0;
  const index11 = y1 * edgeMap.width + x1;
  const top = edgeMap.magnitudes[index00] * (1 - tx) + edgeMap.magnitudes[index10] * tx;
  const bottom = edgeMap.magnitudes[index01] * (1 - tx) + edgeMap.magnitudes[index11] * tx;
  return top * (1 - ty) + bottom * ty;
};

const normalise = (vector: { x: number; y: number }) => {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
};

export const snapPolygonToEdges = (
  polygon: Array<{ x: number; y: number }>,
  options: {
    edgeMap: EdgeMap;
    imageWidth: number;
    imageHeight: number;
    searchRadius?: number;
  }
) => {
  const { edgeMap, imageWidth, imageHeight } = options;
  if (!polygon || polygon.length === 0 || edgeMap.maxMagnitude === 0) {
    return polygon;
  }

  const maxDimension = Math.max(imageWidth, imageHeight);
  const maxDistance = Math.max(
    8,
    options.searchRadius ?? Math.max(12, maxDimension * 0.02)
  );
  const step = Math.max(1, Math.round(maxDistance / 24));
  const distancePenalty = edgeMap.maxMagnitude / Math.max(maxDistance, 1) / 6;
  const minimumGain = edgeMap.maxMagnitude * 0.05;

  return polygon.map((point, index) => {
    const prev = polygon[(index - 1 + polygon.length) % polygon.length];
    const next = polygon[(index + 1) % polygon.length];

    const currentPx = { x: point.x * imageWidth, y: point.y * imageHeight };
    const prevPx = { x: prev.x * imageWidth, y: prev.y * imageHeight };
    const nextPx = { x: next.x * imageWidth, y: next.y * imageHeight };

    const incoming = normalise({ x: currentPx.x - prevPx.x, y: currentPx.y - prevPx.y });
    const outgoing = normalise({ x: nextPx.x - currentPx.x, y: nextPx.y - currentPx.y });

    const normals: Array<{ x: number; y: number }> = [];
    if (incoming.x !== 0 || incoming.y !== 0) {
      normals.push({ x: -incoming.y, y: incoming.x });
    }
    if (outgoing.x !== 0 || outgoing.y !== 0) {
      normals.push({ x: -outgoing.y, y: outgoing.x });
    }

    if (normals.length === 0) {
      return {
        x: clamp(point.x, 0, 1),
        y: clamp(point.y, 0, 1),
      };
    }

    const baseMagnitude = sampleEdgeMagnitude(edgeMap, currentPx.x, currentPx.y);
    let bestMagnitude = baseMagnitude;
    let bestScore = baseMagnitude;
    let bestPoint = { ...currentPx };

    normals.forEach((normalVector) => {
      const normal = normalise(normalVector);
      if (normal.x === 0 && normal.y === 0) return;
      [1, -1].forEach((direction) => {
        for (let distance = step; distance <= maxDistance; distance += step) {
          const candidate = {
            x: clamp(currentPx.x + normal.x * distance * direction, 0, imageWidth - 1),
            y: clamp(currentPx.y + normal.y * distance * direction, 0, imageHeight - 1),
          };
          const magnitude = sampleEdgeMagnitude(edgeMap, candidate.x, candidate.y);
          const score = magnitude - distance * distancePenalty;
          if (score > bestScore) {
            bestScore = score;
            bestMagnitude = magnitude;
            bestPoint = candidate;
          }
        }
      });
    });

    if (bestMagnitude <= baseMagnitude + minimumGain || bestMagnitude <= minimumGain) {
      return {
        x: clamp(point.x, 0, 1),
        y: clamp(point.y, 0, 1),
      };
    }

    return {
      x: clamp(bestPoint.x / imageWidth, 0, 1),
      y: clamp(bestPoint.y / imageHeight, 0, 1),
    };
  });
};

