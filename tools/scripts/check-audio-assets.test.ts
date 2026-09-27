import { describe, expect, it } from 'vitest';

import path from 'node:path';

import { findMissingAudioAssets, importedAssetPaths } from './check-audio-assets.js';

describe('findMissingAudioAssets', () => {
  it('reports no missing SFX cue now that every one is wired to an in-house @cp/sound-art asset', () => {
    const { missingSfx } = findMissingAudioAssets();

    expect(missingSfx).toEqual([]);
  });

  it('reports no missing music guide now that all 6 themes are wired and marked available', () => {
    const { missingMusic } = findMissingAudioAssets();

    expect(missingMusic).toEqual([]);
  });

  it('reports no gap in either platform SFX map: each imports every cue in its own format only', () => {
    const { sfxMapGaps } = findMissingAudioAssets();

    expect(sfxMapGaps).toEqual([]);
  });
});

describe('importedAssetPaths', () => {
  it('resolves asset imports relative to the map file and ignores module imports', () => {
    const mapDir = path.resolve(import.meta.dirname, '../../apps/mobile/src/motion/feedback');
    const source = [
      "import type { AudioSource } from 'expo-audio';",
      "import slap from '../../../assets/sfx/slap.ogg';",
      "import tick from '../../../assets/sfx/tick.caf';",
    ].join('\n');

    expect(importedAssetPaths(source, mapDir)).toEqual(['sfx/slap.ogg', 'sfx/tick.caf']);
  });
});
