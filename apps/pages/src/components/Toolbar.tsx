import React from 'react';

export type ToolbarTool = 'magneticLasso' | 'smartWand';

export interface ToolbarSettings {
  edgeContrast: number;
  snapStrength: number;
  autoEntranceLock: boolean;
  livePreview: boolean;
  showDebugOverlay: boolean;
}

export interface ToolbarProps {
  activeTool: ToolbarTool;
  settings: ToolbarSettings;
  onToolChange: (tool: ToolbarTool) => void;
  onSettingsChange: (settings: ToolbarSettings) => void;
  onToggleDebugOverlay?: (enabled: boolean) => void;
}

export const DEFAULT_TOOLBAR_SETTINGS: ToolbarSettings = {
  edgeContrast: 0.65,
  snapStrength: 0.7,
  autoEntranceLock: true,
  livePreview: true,
  showDebugOverlay: false,
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  settings,
  onToolChange,
  onSettingsChange,
  onToggleDebugOverlay,
}) => {
  const updateSetting = <Key extends keyof ToolbarSettings>(key: Key, value: ToolbarSettings[Key]) => {
    const next = { ...settings, [key]: value };
    onSettingsChange(next);
    if (key === 'showDebugOverlay' && onToggleDebugOverlay) {
      onToggleDebugOverlay(Boolean(value));
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-amber-200/60 bg-white/80 p-4 shadow-lg shadow-amber-500/10 transition-colors dark:border-amber-500/30 dark:bg-slate-950/70">
      <div className="flex items-center justify-between" role="group" aria-label="Selection tools">
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition ${
              activeTool === 'magneticLasso'
                ? 'border-transparent bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg shadow-amber-500/30'
                : 'border-amber-200/60 bg-white/80 text-amber-700 hover:border-amber-300/70 hover:bg-amber-50/70 dark:border-amber-500/30 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:bg-amber-500/10'
            }`}
            aria-pressed={activeTool === 'magneticLasso'}
            onClick={() => onToolChange('magneticLasso')}
          >
            Magnetic Lasso (L)
          </button>
          <button
            type="button"
            className={`rounded-xl border px-3 py-2 text-sm font-semibold uppercase tracking-[0.2em] transition ${
              activeTool === 'smartWand'
                ? 'border-transparent bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg shadow-amber-500/30'
                : 'border-amber-200/60 bg-white/80 text-amber-700 hover:border-amber-300/70 hover:bg-amber-50/70 dark:border-amber-500/30 dark:bg-slate-900/60 dark:text-amber-200 dark:hover:bg-amber-500/10'
            }`}
            aria-pressed={activeTool === 'smartWand'}
            onClick={() => onToolChange('smartWand')}
          >
            Smart Wand (W)
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3" aria-label="Advanced selection settings">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-amber-100">
          Edge contrast emphasis
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={clamp(settings.edgeContrast, 0, 1)}
            onChange={(event) => updateSetting('edgeContrast', parseFloat(event.currentTarget.value))}
            aria-label="Edge contrast emphasis"
          />
          <span className="text-xs font-normal text-slate-500 dark:text-amber-200/70">
            Higher values increase the CLAHE contrast boost for the worker pipeline.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-amber-100">
          Snap strength
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={clamp(settings.snapStrength, 0, 1)}
            onChange={(event) => updateSetting('snapStrength', parseFloat(event.currentTarget.value))}
            aria-label="Snap strength"
          />
          <span className="text-xs font-normal text-slate-500 dark:text-amber-200/70">
            Controls how aggressively polygons snap to the cost pyramid edges.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-amber-100">
          <input
            type="checkbox"
            checked={settings.autoEntranceLock}
            onChange={(event) => updateSetting('autoEntranceLock', event.currentTarget.checked)}
          />
          Auto-lock detected entrances
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-amber-100">
          <input
            type="checkbox"
            checked={settings.livePreview}
            onChange={(event) => updateSetting('livePreview', event.currentTarget.checked)}
          />
          Live preview updates
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-amber-100">
          <input
            type="checkbox"
            checked={settings.showDebugOverlay}
            onChange={(event) => updateSetting('showDebugOverlay', event.currentTarget.checked)}
          />
          Show worker debug overlays
        </label>
      </div>
    </div>
  );
};

export default Toolbar;

