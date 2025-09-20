export type RoomTool = 'lasso' | 'smartSnap' | 'paintbrush' | 'smartWand';

export interface RoomToolOption {
  id: RoomTool;
  label: string;
  description: string;
  tooltip: string;
}

export const ROOM_TOOL_OPTIONS: RoomToolOption[] = [
  {
    id: 'lasso',
    label: 'Lasso Outline',
    description: 'Draw freehand boundaries for irregular rooms and corridors.',
    tooltip: 'Sketch the perimeter manually with a freehand lasso.',
  },
  {
    id: 'smartSnap',
    label: 'Smart Snap',
    description: 'Rough in the outline and let edges snap to nearby walls.',
    tooltip: 'Trace the area and we will pull the boundary to strong edges.',
  },
  {
    id: 'paintbrush',
    label: 'Paintbrush Fill',
    description: 'Paint over the area to generate a smooth outline automatically.',
    tooltip: 'Brush over the space; we will convert the stroke to a room.',
  },
  {
    id: 'smartWand',
    label: 'Smart Wand',
    description: 'Click inside a space to grow a selection that hugs the walls.',
    tooltip: 'Click once and the wand will try to detect the room for you.',
  },
];

export const DEFAULT_ROOM_TOOL: RoomTool = 'lasso';

export const ROOM_TOOL_INSTRUCTIONS: Record<RoomTool, string> = {
  lasso: 'Click and drag to trace the room with the lasso tool.',
  smartSnap: 'Sketch the rough outline—the smart snap tool will cling to walls.',
  paintbrush: 'Paint over the area to capture it; lift your cursor to finish.',
  smartWand: 'Click inside a room to let the smart wand outline it automatically.',
};

export const getRoomToolOption = (tool: RoomTool) =>
  ROOM_TOOL_OPTIONS.find((option) => option.id === tool) ?? ROOM_TOOL_OPTIONS[0];
