import { describe, expect, it } from 'vitest';

import { findMissingAudioAssets } from './check-audio-assets.js';

describe('findMissingAudioAssets', () => {
  it('reports no missing SFX cue now that every one is wired to an in-house @cp/sound-art asset', () => {
    const { missingSfx } = findMissingAudioAssets();

    expect(missingSfx).toEqual([]);
  });

  it('reports no missing music guide now that all 6 themes are wired and marked available', () => {
    const { missingMusic } = findMissingAudioAssets();

    expect(missingMusic).toEqual([]);
  });
});
