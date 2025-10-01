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
    <div className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/70 p-5 shadow-lg shadow-amber-500/10 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70 dark:shadow-black/40">
      <div className="flex items-center justify-between" role="group" aria-label="Selection tools">
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTool === 'magneticLasso'
                ? 'border border-amber-400/70 bg-amber-200/80 text-slate-900 shadow shadow-amber-500/30 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100'
                : 'border border-white/60 bg-white/70 text-slate-700 hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-amber-400/70 dark:hover:text-amber-200'
            }`}
            aria-pressed={activeTool === 'magneticLasso'}
            onClick={() => onToolChange('magneticLasso')}
          >
            Magnetic Lasso (L)
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTool === 'smartWand'
                ? 'border border-amber-400/70 bg-amber-200/80 text-slate-900 shadow shadow-amber-500/30 dark:border-amber-400/50 dark:bg-amber-400/20 dark:text-amber-100'
                : 'border border-white/60 bg-white/70 text-slate-700 hover:border-amber-400/70 hover:text-amber-600 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-amber-400/70 dark:hover:text-amber-200'
            }`}
            aria-pressed={activeTool === 'smartWand'}
            onClick={() => onToolChange('smartWand')}
          >
            Smart Wand (W)
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4" aria-label="Advanced selection settings">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Edge contrast emphasis
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={clamp(settings.edgeContrast, 0, 1)}
            onChange={(event) => updateSetting('edgeContrast', parseFloat(event.currentTarget.value))}
            aria-label="Edge contrast emphasis"
            className="accent-amber-500"
          />
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            Higher values increase the CLAHE contrast boost for the worker pipeline.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Snap strength
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={clamp(settings.snapStrength, 0, 1)}
            onChange={(event) => updateSetting('snapStrength', parseFloat(event.currentTarget.value))}
            aria-label="Snap strength"
            className="accent-amber-500"
          />
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
            Controls how aggressively polygons snap to the cost pyramid edges.
          </span>
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
          <input
            type="checkbox"
            checked={settings.autoEntranceLock}
            onChange={(event) => updateSetting('autoEntranceLock', event.currentTarget.checked)}
            className="accent-amber-500"
          />
          Auto-lock detected entrances
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
          <input
            type="checkbox"
            checked={settings.livePreview}
            onChange={(event) => updateSetting('livePreview', event.currentTarget.checked)}
            className="accent-amber-500"
          />
          Live preview updates
        </label>
        <label className="flex items-center gap-2 rounded-2xl border border-white/60 bg-white/60 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-200">
          <input
            type="checkbox"
            checked={settings.showDebugOverlay}
            onChange={(event) => updateSetting('showDebugOverlay', event.currentTarget.checked)}
            className="accent-amber-500"
          />
          Show worker debug overlays
        </label>
      </div>
    </div>
  );
};

export default Toolbar;

