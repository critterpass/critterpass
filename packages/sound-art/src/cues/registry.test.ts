import { describe, expect, it } from 'vitest';

import { dcOffset, peakAbs } from '../core/signal';
import { buildSfxRegistry, SFX_TOKEN_IDS } from './registry';

describe('sfx cue registry', () => {
  const registry = buildSfxRegistry();

  it('covers every sfx/ambient cue in the token table exactly once', () => {
    expect(registry.map((c) => c.id).sort()).toEqual([...SFX_TOKEN_IDS].sort());
  });

  it('every cue renders finite, non-empty, DC-clean, non-clipping-before-normalisation audio', () => {
    for (const cue of registry) {
      const pcm = cue.render();
      expect(pcm.length, `${cue.id} should render samples`).toBeGreaterThan(0);
      expect(
        pcm.every((v) => Number.isFinite(v)),
        `${cue.id} has non-finite samples`,
      ).toBe(true);
      expect(peakAbs(pcm), `${cue.id} peak in range`).toBeLessThanOrEqual(1.001);
      expect(Math.abs(dcOffset(pcm)), `${cue.id} DC offset near zero`).toBeLessThan(0.02);
      // Cues are short, punchy interface sounds: sanity bound so a bug can't render minutes of audio.
      expect(pcm.length / 48000, `${cue.id} duration under 3s`).toBeLessThan(3);
    }
  });

  it('renders are deterministic across calls', () => {
    for (const cue of registry) {
      const a = cue.render();
      const b = cue.render();
      expect(Array.from(a)).toEqual(Array.from(b));
    }
  });

  it('every cue has a non-empty asset basename and a valid category/kind', () => {
    for (const cue of registry) {
      expect(cue.assetBasename.length).toBeGreaterThan(0);
      expect(['sfx', 'ambient']).toContain(cue.kind);
      expect(cue.category.length).toBeGreaterThan(0);
    }
  });
});
