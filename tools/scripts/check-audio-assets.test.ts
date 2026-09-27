import { describe, expect, it } from 'vitest';

import { tokens } from '@cp/design-tokens';

import { findMissingAudioAssets } from './check-audio-assets.js';

describe('findMissingAudioAssets', () => {
  it('reports every sfx-kind cue as missing until its asset is licensed', () => {
    const sfxCueCount = Object.values(tokens.sound.cue).filter(
      (cue) => cue.sfxAsset !== null,
    ).length;

    const { missingSfx, missingMusic } = findMissingAudioAssets();

    expect(missingSfx).toHaveLength(sfxCueCount);
    // The 6 guide themes (manifest.json's rows) are also unlicensed yet.
    expect(missingMusic).toHaveLength(6);
  });

  it('names the cue id in each missing-SFX entry', () => {
    const { missingSfx } = findMissingAudioAssets();
    expect(missingSfx.some((entry) => entry.startsWith('thud.heavy'))).toBe(true);
  });
});
