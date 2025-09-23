import {
  compositeMax as compositeMaxSync,
  dilateMask as dilateMaskSync,
  edgeEnergyMultiScale as edgeEnergyMultiScaleSync,
  featherMask as featherMaskSync,
  fillMaskInterior as fillMaskInteriorSync,
  magicWandSelect as magicWandSelectSync,
  rasterizeFreehandPath as rasterizeFreehandPathSync,
  refineBoundaryToEdges as refineBoundaryToEdgesSync,
  type SegmentationWorker,
} from '../../workers/seg';

const fallback: SegmentationWorker = {
  magicWandSelect: magicWandSelectSync,
  refineBoundaryToEdges: refineBoundaryToEdgesSync,
  edgeEnergyMultiScale: edgeEnergyMultiScaleSync,
  rasterizeFreehandPath: rasterizeFreehandPathSync,
  fillMaskInterior: fillMaskInteriorSync,
  dilateMask: dilateMaskSync,
  featherMask: featherMaskSync,
  compositeMax: compositeMaxSync,
};

export const useSegmentation = <K extends keyof SegmentationWorker>(
  segmentation: SegmentationWorker | null,
  key: K,
  ...args: Parameters<SegmentationWorker[K]>
): ReturnType<SegmentationWorker[K]> => {
  const fn = segmentation?.[key] ?? fallback[key];
  return fn(...args);
};

