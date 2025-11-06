import type { Marker } from '../types';
import type { MapMarkerIconDefinition } from '../components/mapMarkerIcons';

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const normalizeHexColor = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const match = HEX_COLOR_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }
  const hex = match[1];
  if (hex.length === 3) {
    const [r, g, b] = hex.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return `#${hex.toLowerCase()}`;
};

const rgbFromNormalizedHex = (hex: string) => {
  const value = hex.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

export const rgbaFromNormalizedHex = (hex: string, alpha: number) => {
  const { r, g, b } = rgbFromNormalizedHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getReadableTextColor = (hex: string) => {
  const { r, g, b } = rgbFromNormalizedHex(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#0f172a' : '#f8fafc';
};

export const resolveMarkerBaseColor = (
  marker: Marker,
  definition?: MapMarkerIconDefinition,
): string => {
  const candidates: Array<string | null | undefined> = [
    marker.color,
    definition?.defaultColor,
    '#facc15',
  ];
  for (const candidate of candidates) {
    const normalized = normalizeHexColor(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return '#facc15';
};

export const normaliseMarkers = <T extends { id: string }>(markers?: Record<string, T> | T[]): T[] => {
  if (!markers) {
    return [];
  }
  if (Array.isArray(markers)) {
    return markers;
  }
  return Object.values(markers);
};

