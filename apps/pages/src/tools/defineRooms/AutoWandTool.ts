import type { Bounds, Point } from '../../types/geometry';
import type { RoomMask } from '../../utils/roomMask';
import type { SelectionState } from '../../state/selection';
import { useSegmentation } from './segmentationHelpers';
import type { DefineRoomsTool, PointerState, ToolContext } from './ToolContext';

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const clampPoint = (point: Point): Point => ({ x: clamp01(point.x), y: clamp01(point.y) });

const buildCircleMask = (center: Point, radius: number): RoomMask => {
  const resolution = 512;
  const bounds: Bounds = {
    minX: clamp01(center.x - radius),
    minY: clamp01(center.y - radius),
    maxX: clamp01(center.x + radius),
    maxY: clamp01(center.y + radius),
  };
  const width = Math.max(32, Math.round((bounds.maxX - bounds.minX || 0.02) * resolution));
  const height = Math.max(32, Math.round((bounds.maxY - bounds.minY || 0.02) * resolution));
  const mask = new Uint8ClampedArray(width * height);
  const scaleX = bounds.maxX - bounds.minX || 1;
  const scaleY = bounds.maxY - bounds.minY || 1;
  for (let y = 0; y < height; y += 1) {
    const vy = bounds.minY + ((y + 0.5) / height) * scaleY;
    for (let x = 0; x < width; x += 1) {
      const ux = bounds.minX + ((x + 0.5) / width) * scaleX;
      if (Math.hypot(ux - center.x, vy - center.y) <= radius) {
        mask[y * width + x] = 255;
      }
    }
  }
  return { width, height, bounds, data: mask };
};

interface EnergyContext {
  data: Float32Array;
  width: number;
  height: number;
}

const getEnergyContext = (ctx: ToolContext): EnergyContext | null => {
  if (!ctx.raster) {
    return null;
  }
  if (ctx.raster.edgeEnergy && ctx.raster.edgeEnergy.length === ctx.raster.width * ctx.raster.height) {
    return {
      data: ctx.raster.edgeEnergy,
      width: ctx.raster.width,
      height: ctx.raster.height,
    };
  }
  if (!ctx.segmentation) {
    return null;
  }
  const layers = Array.isArray(ctx.raster.layers) ? ctx.raster.layers : [ctx.raster.layers];
  const source = layers[0];
  if (!source) {
    return null;
  }
  const energy = useSegmentation(ctx.segmentation, 'edgeEnergyMultiScale', source, ctx.raster.width, ctx.raster.height, {
    scales: 3,
    baseSigma: 0.8,
  });
  return { data: energy, width: ctx.raster.width, height: ctx.raster.height };
};

const sampleEnergyForMask = (mask: RoomMask, energy: EnergyContext): Float32Array => {
  const result = new Float32Array(mask.width * mask.height);
  const { bounds } = mask;
  const widthScale = bounds.maxX - bounds.minX || 1;
  const heightScale = bounds.maxY - bounds.minY || 1;
  const maxX = energy.width - 1;
  const maxY = energy.height - 1;
  for (let y = 0; y < mask.height; y += 1) {
    const vy = bounds.minY + ((y + 0.5) / mask.height) * heightScale;
    const sourceY = clamp01(vy) * maxY;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(maxY, y0 + 1);
    const wy = sourceY - y0;
    for (let x = 0; x < mask.width; x += 1) {
      const ux = bounds.minX + ((x + 0.5) / mask.width) * widthScale;
      const sourceX = clamp01(ux) * maxX;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(maxX, x0 + 1);
      const wx = sourceX - x0;
      const i00 = energy.data[y0 * energy.width + x0];
      const i10 = energy.data[y0 * energy.width + x1];
      const i01 = energy.data[y1 * energy.width + x0];
      const i11 = energy.data[y1 * energy.width + x1];
      const top = i00 * (1 - wx) + i10 * wx;
      const bottom = i01 * (1 - wx) + i11 * wx;
      result[y * mask.width + x] = top * (1 - wy) + bottom * wy;
    }
  }
  return result;
};

const cropMask = (data: Uint8ClampedArray, width: number, height: number): { mask: RoomMask; bounds: Bounds } | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[y * width + x] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return null;
  }
  const padding = Math.max(2, Math.round(Math.max(width, height) * 0.005));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropped = new Uint8ClampedArray(cropWidth * cropHeight);
  for (let y = 0; y < cropHeight; y += 1) {
    const sourceRow = (minY + y) * width + minX;
    cropped.set(data.subarray(sourceRow, sourceRow + cropWidth), y * cropWidth);
  }
  const bounds: Bounds = {
    minX: clamp01(minX / width),
    minY: clamp01(minY / height),
    maxX: clamp01((maxX + 1) / width),
    maxY: clamp01((maxY + 1) / height),
  };
  return {
    mask: {
      width: cropWidth,
      height: cropHeight,
      bounds,
      data: cropped,
    },
    bounds,
  };
};

const buildMaskFromSelection = (
  ctx: ToolContext,
  selection: Uint8ClampedArray,
  width: number,
  height: number,
  selectionState: SelectionState,
): RoomMask | null => {
  const cropped = cropMask(selection, width, height);
  if (!cropped) {
    return null;
  }
  const energy = getEnergyContext(ctx);
  let data = cropped.mask.data;
  if (energy) {
    const stickiness = clamp01(selectionState.smartStickiness ?? 0.55);
    const edgeThreshold = clamp01(0.2 + stickiness * 0.5);
    const edgeWidth = Math.min(Math.max(selectionState.edgeRefinementWidth ?? 0.02, 0.005), 0.25);
    const bandSize = Math.max(1, Math.round(Math.max(cropped.mask.width, cropped.mask.height) * edgeWidth));
    const sampled = sampleEnergyForMask(cropped.mask, energy);
    data = useSegmentation(
      ctx.segmentation,
      'refineBoundaryToEdges',
      cropped.mask.data,
      cropped.mask.width,
      cropped.mask.height,
      sampled,
      {
        bandSize,
        edgeThreshold,
        connectivity: selectionState.wandConnectivity ?? 8,
      },
    );
  }
  const featherAmount = Math.min(Math.max(selectionState.selectionFeather ?? 0.015, 0), 0.25);
  const featherRadius = Math.round(Math.max(cropped.mask.width, cropped.mask.height) * featherAmount);
  const feathered = useSegmentation(ctx.segmentation, 'featherMask', data, cropped.mask.width, cropped.mask.height, featherRadius);
  const dilationRadius = selectionState.dilateBy5px
    ? Math.max(
        0,
        Math.round((5 / Math.max(width, height, 1)) * Math.max(cropped.mask.width, cropped.mask.height))
      )
    : 0;
  const finalMask =
    dilationRadius > 0
      ? useSegmentation(
          ctx.segmentation,
          'dilateMask',
          feathered,
          cropped.mask.width,
          cropped.mask.height,
          dilationRadius
        )
      : feathered;
  return {
    width: cropped.mask.width,
    height: cropped.mask.height,
    bounds: cropped.bounds,
    data: finalMask,
  };
};

export class AutoWandTool implements DefineRoomsTool {
  readonly id = 'autoWand';

  private requestId = 0;

  onPointerDown(ctx: ToolContext, pointer: PointerState) {
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }
    const seed = clampPoint(ctx.snap(ctx.clamp(pointer.point)));
    const request = ++this.requestId;

    if (!ctx.raster) {
      const fallbackRadius = Math.max(0.02, (ctx.store.getState().selection.brushRadius ?? 0.05) * 0.75);
      ctx.store.commitMask(buildCircleMask(seed, fallbackRadius));
      return;
    }

    const layers = ctx.raster.layers;
    const width = ctx.raster.width;
    const height = ctx.raster.height;
    const selectionState = ctx.store.getState().selection;
    const tolerance = Math.max(4, Math.round(12 + (selectionState.wandTolerance ?? 0.25) * 48));
    const contiguous = selectionState.wandContiguous ?? true;
    const antiAlias = selectionState.wandAntiAlias ?? true;
    const sampleAllLayers = selectionState.wandSampleAllLayers ?? Array.isArray(layers);
    const wandMask = useSegmentation(ctx.segmentation, 'magicWandSelect', layers, width, height, seed, {
      tolerance,
      connectivity: selectionState.wandConnectivity ?? 8,
      contiguous,
      antiAlias,
      antiAliasFalloff: tolerance * 0.3,
      sampleAllLayers,
    });

    if (this.requestId !== request) {
      return;
    }

    ctx.store.setBusy('Detecting region…');
    try {
      const mask = buildMaskFromSelection(ctx, wandMask, width, height, selectionState);
      if (this.requestId !== request) {
        return;
      }
      if (mask) {
        ctx.store.commitMask(mask);
      } else {
        const fallbackRadius = Math.max(0.02, (selectionState.brushRadius ?? 0.05) * 0.75);
        ctx.store.commitMask(buildCircleMask(seed, fallbackRadius));
      }
    } finally {
      if (this.requestId === request) {
        ctx.store.setBusy(null);
      }
    }
  }

  onPointerMove() {}

  onPointerUp() {}

  onCancel(ctx: ToolContext) {
    this.requestId += 1;
    ctx.store.setBusy(null);
  }
}

export const createAutoWandTool = () => new AutoWandTool();

