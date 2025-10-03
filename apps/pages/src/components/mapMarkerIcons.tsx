import React from 'react';

export type MapMarkerIconKey =
  | 'character'
  | 'monster'
  | 'trap'
  | 'object'
  | 'investigation'
  | 'area';

export type MapMarkerKind = 'point' | 'area';

export interface MapMarkerIconDefinition {
  key: MapMarkerIconKey;
  label: string;
  kind: MapMarkerKind;
  defaultColor: string;
  icon: React.ReactElement;
}

const iconBaseClassName = 'h-5 w-5';

const createIcon = (paths: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-hidden="true"
    className={iconBaseClassName}
    focusable="false"
  >
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}>
      {paths}
    </g>
  </svg>
);

export const mapMarkerIconDefinitions: MapMarkerIconDefinition[] = [
  {
    key: 'character',
    label: 'Character Marker',
    kind: 'point',
    defaultColor: '#facc15',
    icon: createIcon(
      <>
        <circle cx={12} cy={7.5} r={3.5} />
        <path d="M6.5 19c1.2-3.2 4-5 5.5-5s4.3 1.8 5.5 5" />
      </>,
    ),
  },
  {
    key: 'monster',
    label: 'Monster Marker',
    kind: 'point',
    defaultColor: '#f97316',
    icon: createIcon(
      <>
        <path d="M6 8c0-2.8 2.7-5 6-5s6 2.2 6 5v4.5c0 2-1.8 3.5-4 3.5h-4c-2.2 0-4-1.5-4-3.5Z" />
        <path d="M9.5 12.5c.5.5 1.2.8 2 .8s1.5-.3 2-.8" />
        <path d="M8 4.5 9.5 7 11 4.5" />
        <path d="M13 4.5 14.5 7 16 4.5" />
      </>,
    ),
  },
  {
    key: 'trap',
    label: 'Trap Marker',
    kind: 'point',
    defaultColor: '#f87171',
    icon: createIcon(
      <>
        <path d="m5 16 7-10 7 10" />
        <path d="M5 16h14" />
        <path d="m9 16 3 4 3-4" />
      </>,
    ),
  },
  {
    key: 'object',
    label: 'Object Marker',
    kind: 'point',
    defaultColor: '#38bdf8',
    icon: createIcon(
      <>
        <path d="M6.5 10 12 6l5.5 4" />
        <path d="M6 10v6l6 4 6-4v-6" />
        <path d="M6 16.5 12 20l6-3.5" />
      </>,
    ),
  },
  {
    key: 'investigation',
    label: 'Investigation Marker',
    kind: 'point',
    defaultColor: '#a855f7',
    icon: createIcon(
      <>
        <circle cx={10.5} cy={10.5} r={4} />
        <path d="m13.5 13.5 4 4" />
      </>,
    ),
  },
  {
    key: 'area',
    label: 'Area Marker',
    kind: 'area',
    defaultColor: '#22c55e',
    icon: createIcon(
      <>
        <circle cx={12} cy={12} r={7} />
        <circle cx={12} cy={12} r={3.5} />
      </>,
    ),
  },
];

export const mapMarkerIconsByKey: Record<MapMarkerIconKey, MapMarkerIconDefinition> = mapMarkerIconDefinitions.reduce(
  (acc, definition) => {
    acc[definition.key] = definition;
    return acc;
  },
  {} as Record<MapMarkerIconKey, MapMarkerIconDefinition>,
);

export const getMapMarkerIconDefinition = (key: string | null | undefined) => {
  if (!key) {
    return undefined;
  }
  return mapMarkerIconsByKey[key as MapMarkerIconKey];
};

