import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import { SFX_ASSET_MODULES as ANDROID_SFX } from '../sfx-assets.android';
import { SFX_ASSET_MODULES as IOS_SFX } from '../sfx-assets.ios';

const sfxCueIds = Object.entries(tokens.sound.cue)
  .filter(([, cue]) => cue.sfxAsset?.startsWith('sfx/'))
  .map(([cueId]) => cueId)
  .sort();

describe('platform SFX asset maps', () => {
  it('cover exactly the token cues with an SFX asset, on both platforms', () => {
    expect(Object.keys(IOS_SFX).sort()).toEqual(sfxCueIds);
    expect(Object.keys(ANDROID_SFX).sort()).toEqual(sfxCueIds);
  });

  // jest-expo stubs every asset import as a registry id, so the per-platform file format is checked
  // from the map sources by `tools/scripts/check-audio-assets.ts` instead.
  it('resolves every cue to a bundled asset module on both platforms', () => {
    for (const cueId of sfxCueIds) {
      expect(typeof IOS_SFX[cueId as keyof typeof IOS_SFX]).toBe('number');
      expect(typeof ANDROID_SFX[cueId as keyof typeof ANDROID_SFX]).toBe('number');
    }
  });
});
