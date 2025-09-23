/* @vitest-environment node */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import type { Campaign } from '../types';

const baseCampaign: Campaign = {
  id: 'campaign-1',
  name: 'Test Campaign',
  isPublic: false,
};

const noop = () => {};

const renderStepTwoMarkup = async (useNewDefineRooms: boolean) => {
  vi.resetModules();
  vi.doMock('../components/mapCreationWizardConfig', () => ({
    USE_NEW_DEFINE_ROOMS: useNewDefineRooms,
  }));

  vi.doMock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    const originalUseState = actual.useState;
    let callIndex = 0;
    const customUseState: typeof actual.useState = ((initial: unknown) => {
      if (callIndex === 0) {
        callIndex += 1;
        return [2, vi.fn()] as unknown as ReturnType<typeof originalUseState>;
      }
      callIndex += 1;
      return originalUseState(initial);
    }) as typeof actual.useState;
    return {
      ...actual,
      default: { ...actual, useState: customUseState },
      useState: customUseState,
    };
  });

  const { default: MapCreationWizard } = await import('../components/MapCreationWizard');
  const markup = renderToStaticMarkup(
    React.createElement(MapCreationWizard, {
      campaign: baseCampaign,
      onClose: noop,
      onComplete: noop,
    })
  );
  vi.doUnmock('react');
  return markup;
};

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('react');
});

describe('MapCreationWizard define rooms step', () => {
  it('renders placeholder when new define rooms feature flag is enabled', async () => {
    const markup = await renderStepTwoMarkup(true);
    expect(markup).toContain('data-testid="define-rooms-placeholder"');
    expect(markup).toContain('Define Rooms (new editor coming soon)');
  });

  it('renders legacy UI when new define rooms feature flag is disabled', async () => {
    const markup = await renderStepTwoMarkup(false);
    expect(markup).toContain('Rooms &amp; Hallways');
  });
});
