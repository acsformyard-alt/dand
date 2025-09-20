import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROOM_TOOL,
  ROOM_TOOL_INSTRUCTIONS,
  ROOM_TOOL_OPTIONS,
  type RoomToolOption,
} from './roomToolOptions';

describe('roomToolOptions', () => {
  it('defines the expected tool identifiers', () => {
    const ids = ROOM_TOOL_OPTIONS.map((option) => option.id);
    expect(ids).toEqual(['lasso', 'smartSnap', 'paintbrush', 'smartWand']);
  });

  it('provides instructions for every tool option', () => {
    ROOM_TOOL_OPTIONS.forEach((option: RoomToolOption) => {
      expect(ROOM_TOOL_INSTRUCTIONS[option.id]).toBeTruthy();
    });
  });

  it('defaults to the lasso tool', () => {
    expect(DEFAULT_ROOM_TOOL).toBe('lasso');
  });
});
