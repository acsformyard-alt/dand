import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import type { MapRecord } from '../types';

interface MapFolderListProps {
  maps: MapRecord[];
  selectedMapId: string | null;
  onSelect: (map: MapRecord) => void;
  onCreateMap: () => void;
  onDeleteMap: (map: MapRecord) => void;
  onDeleteGroup: (groupName: string, maps: MapRecord[]) => void;
}

interface GroupedMaps {
  name: string;
  maps: MapRecord[];
}

const getMetadataString = (metadata: MapRecord['metadata'], key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
};

const getMetadataStringArray = (metadata: MapRecord['metadata'], key: string) => {
  const value = metadata?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
};

const MapFolderList: React.FC<MapFolderListProps> = ({
  maps,
  selectedMapId,
  onSelect,
  onCreateMap,
  onDeleteMap,
  onDeleteGroup,
}) => {
  const grouped = useMemo<GroupedMaps[]>(() => {
    const byGroup = new Map<string, MapRecord[]>();
    maps.forEach((map) => {
      const metadataGroup = getMetadataString(map.metadata, 'grouping') ?? getMetadataString(map.metadata, 'group');
      const groupName = metadataGroup?.trim().length ? metadataGroup : 'Ungrouped Maps';
      if (!byGroup.has(groupName)) {
        byGroup.set(groupName, []);
      }
      byGroup.get(groupName)!.push(map);
    });
    return Array.from(byGroup.entries())
      .map(([name, groupMaps]) => ({ name, maps: groupMaps }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [maps]);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedGroups((previous) => {
      const next: Record<string, boolean> = { ...previous };
      grouped.forEach((group) => {
        if (typeof next[group.name] === 'undefined') {
          next[group.name] = true;
        }
      });
      return next;
    });
  }, [grouped]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((previous) => ({ ...previous, [groupName]: !previous[groupName] }));
  };

  return (
    <div className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-2xl shadow-amber-500/15 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-600 dark:text-slate-400">Maps</p>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Campaign Atlas</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">Organize maps into folders to keep your encounters tidy.</p>
        </div>
        <button
          type="button"
          onClick={onCreateMap}
          className="rounded-xl border border-amber-400/70 bg-amber-300/80 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-900 shadow-sm transition hover:bg-amber-300/90 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
        >
          New Map
        </button>
      </div>
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/60 bg-white/60 px-6 py-12 text-center text-sm text-slate-600 dark:border-slate-800/70 dark:bg-slate-950/60 dark:text-slate-400">
          No maps yet. Create a map to start building your world.
        </div>
      ) : (
        <div className="grid gap-4">
          {grouped.map((group) => {
            const expanded = expandedGroups[group.name];
            return (
              <div key={group.name} className="rounded-2xl border border-white/60 bg-white/60 shadow-lg shadow-amber-500/10 dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
                <div className="flex items-start justify-between gap-3 px-5 py-4 sm:items-center">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.name)}
                    className="flex w-full flex-1 items-center justify-between gap-4 text-left"
                  >
                    <div>
                      <p className="text-lg font-semibold text-slate-900 dark:text-white">{group.name}</p>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">{group.maps.length} Maps</p>
                    </div>
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold transition ${
                        expanded
                          ? 'border-amber-400/70 bg-amber-300/70 text-slate-900 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100'
                          : 'border-white/60 bg-white/70 text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300'
                      }`}
                      aria-hidden="true"
                    >
                      {expanded ? '−' : '+'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-400/70 bg-rose-200/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-700 transition hover:bg-rose-200/80 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteGroup(group.name, group.maps);
                    }}
                    aria-label={`Delete group ${group.name}`}
                    title="Delete group"
                  >
                    Delete
                  </button>
                </div>
                {expanded && (
                  <div className="grid gap-4 border-t border-white/60 px-5 py-5 sm:grid-cols-2 xl:grid-cols-3 dark:border-slate-800/60">
                    {group.maps.map((map) => {
                      const description = getMetadataString(map.metadata, 'description');
                      const notes = getMetadataString(map.metadata, 'notes');
                      const tags = getMetadataStringArray(map.metadata, 'tags');
                      return (
                        <div
                          key={map.id}
                          role="button"
                          tabIndex={0}
                          aria-current={selectedMapId === map.id ? 'true' : undefined}
                          onClick={() => onSelect(map)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
                              event.preventDefault();
                              onSelect(map);
                            }
                          }}
                          className={`group relative overflow-hidden rounded-2xl border px-5 py-6 text-left shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white/70 dark:focus-visible:ring-offset-slate-950 ${
                            selectedMapId === map.id
                              ? 'border-amber-400/80 bg-amber-100/70 shadow-amber-500/30 dark:border-amber-400/60 dark:bg-amber-400/10'
                              : 'border-white/60 bg-white/70 hover:border-amber-400/70 hover:shadow-amber-500/20 dark:border-slate-800/70 dark:bg-slate-950/70 dark:hover:border-amber-400/60'
                          }`}
                        >
                          <div className="absolute right-4 top-4 flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-rose-400/70 bg-rose-200/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-700 transition hover:bg-rose-200/80 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100 dark:hover:bg-rose-500/30"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDeleteMap(map);
                              }}
                              onKeyDown={(event) => event.stopPropagation()}
                              aria-label={`Delete ${map.name}`}
                              title="Delete map"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                            <span>Map</span>
                            <span>
                              {map.width ?? '—'} × {map.height ?? '—'}
                            </span>
                          </div>
                          <h4 className="text-lg font-semibold text-slate-900 dark:text-white">{map.name}</h4>
                          {description && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p>}
                          {notes && !description && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{notes}</p>}
                          {tags.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center rounded-full border border-white/60 bg-white/70 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-600 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/5 transition group-hover:border-white/10" />
                          <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                            <div
                              className="absolute inset-0 bg-cover bg-center opacity-25"
                              style={{ backgroundImage: `url(${apiClient.buildMapDisplayUrl(map.id)})` }}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/20 via-transparent to-transparent dark:from-slate-950/80" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MapFolderList;
