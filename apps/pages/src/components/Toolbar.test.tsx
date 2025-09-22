import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Toolbar, { DEFAULT_TOOLBAR_SETTINGS } from './Toolbar';

describe('Toolbar', () => {
  it('renders tool buttons and advanced settings controls', () => {
    const html = renderToStaticMarkup(
      <Toolbar
        activeTool="magneticLasso"
        settings={DEFAULT_TOOLBAR_SETTINGS}
        onToolChange={() => {}}
        onSettingsChange={() => {}}
      />
    );
    expect(html).toContain('Magnetic Lasso (L)');
    expect(html).toContain('Smart Wand (W)');
    expect(html).toContain('Edge contrast emphasis');
    expect(html).toContain('Snap strength');
    expect(html).toContain('Auto-lock detected entrances');
    expect(html).toContain('Live preview updates');
    expect(html).toContain('Show worker debug overlays');
  });
});

