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
  gradientX: Float32Array;
  gradientY: Float32Array;
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
  const gradientX = new Float32Array(totalPixels);
  const gradientY = new Float32Array(totalPixels);
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
      gradientX[y * width + x] = gx;
      gradientY[y * width + x] = gy;
      if (magnitude > maxMagnitude) {
        maxMagnitude = magnitude;
      }
    }
  }

  return { width, height, magnitudes, gradientX, gradientY, maxMagnitude };
};

const bilinearSample = (
  values: Float32Array,
  edgeMap: EdgeMap,
  x: number,
  y: number
) => {
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
  const top = values[index00] * (1 - tx) + values[index10] * tx;
  const bottom = values[index01] * (1 - tx) + values[index11] * tx;
  return top * (1 - ty) + bottom * ty;
};

const sampleEdgeMagnitude = (edgeMap: EdgeMap, x: number, y: number) => {
  if (edgeMap.maxMagnitude === 0) return 0;
  return bilinearSample(edgeMap.magnitudes, edgeMap, x, y);
};

const sampleEdgeGradient = (edgeMap: EdgeMap, x: number, y: number) => ({
  x: bilinearSample(edgeMap.gradientX, edgeMap, x, y),
  y: bilinearSample(edgeMap.gradientY, edgeMap, x, y),
});

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
  const perpendicularityThreshold = 0.3;
  const orientationPenaltyFactor = 0.6;

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
    let baseStrength = baseMagnitude;
    let baseScore = baseMagnitude;
    normals.forEach((normalVector) => {
      const normal = normalise(normalVector);
      if (normal.x === 0 && normal.y === 0) return;
      const gradient = sampleEdgeGradient(edgeMap, currentPx.x, currentPx.y);
      const gradientLength = Math.hypot(gradient.x, gradient.y);
      if (gradientLength === 0) return;
      const normalizedGradient = { x: gradient.x / gradientLength, y: gradient.y / gradientLength };
      const alignment = Math.abs(normal.x * normalizedGradient.x + normal.y * normalizedGradient.y);
      const penaltyRatio = Math.max(0, alignment - perpendicularityThreshold) / Math.max(1 - perpendicularityThreshold, 1e-6);
      const strength = baseMagnitude * (1 - penaltyRatio * orientationPenaltyFactor);
      const orientationPenalty = penaltyRatio * orientationPenaltyFactor * edgeMap.maxMagnitude;
      if (strength > baseStrength) {
        baseStrength = strength;
      }
      const score = strength - orientationPenalty;
      if (score > baseScore) {
        baseScore = score;
      }
    });

    let bestStrength = baseStrength;
    let bestMagnitude = baseMagnitude;
    let bestScore = baseScore;
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
          if (magnitude <= 0) continue;
          const displacement = {
            x: candidate.x - currentPx.x,
            y: candidate.y - currentPx.y,
          };
          const displacementLength = Math.hypot(displacement.x, displacement.y);
          if (displacementLength === 0) continue;
          const directionVector = {
            x: displacement.x / displacementLength,
            y: displacement.y / displacementLength,
          };
          const gradient = sampleEdgeGradient(edgeMap, candidate.x, candidate.y);
          const gradientLength = Math.hypot(gradient.x, gradient.y);
          if (gradientLength === 0) continue;
          const normalizedGradient = { x: gradient.x / gradientLength, y: gradient.y / gradientLength };
          const alignment = Math.abs(
            directionVector.x * normalizedGradient.x + directionVector.y * normalizedGradient.y
          );
          const penaltyRatio = Math.max(0, alignment - perpendicularityThreshold) /
            Math.max(1 - perpendicularityThreshold, 1e-6);
          const strength = magnitude * (1 - penaltyRatio * orientationPenaltyFactor);
          if (strength <= 0) continue;
          const orientationPenalty = penaltyRatio * orientationPenaltyFactor * edgeMap.maxMagnitude;
          const score = strength - orientationPenalty - distance * distancePenalty;
          if (score > bestScore) {
            bestScore = score;
            bestStrength = strength;
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

export const smoothPolygon = (
  polygon: Array<{ x: number; y: number }>,
  iterations = 1
) => {
  if (polygon.length < 3 || iterations <= 0) {
    return polygon.map((point) => ({
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    }));
  }

  let current = polygon.map((point) => ({
    x: clamp(point.x, 0, 1),
    y: clamp(point.y, 0, 1),
  }));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < current.length; index += 1) {
      const point = current[index];
      const previous = current[(index - 1 + current.length) % current.length];
      const following = current[(index + 1) % current.length];
      const smoothed = {
        x: clamp((previous.x + point.x * 2 + following.x) / 4, 0, 1),
        y: clamp((previous.y + point.y * 2 + following.y) / 4, 0, 1),
      };
      next.push(smoothed);
    }
    current = next;
  }

  return current;
};

