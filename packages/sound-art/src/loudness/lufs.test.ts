import { describe, expect, it } from 'vitest';

import { integratedLufs, normalizeToLufs } from './lufs';
import { renderTone } from '../core/oscillator';
import { pinkNoise } from '../core/noise';
import { createRng } from '../core/prng';

describe('lufs', () => {
  it('a louder signal measures higher LUFS than a quieter one', () => {
    const loud = renderTone(2, 1000, 'sine', 48000);
    const quiet = renderTone(2, 1000, 'sine', 48000);
    for (let i = 0; i < quiet.length; i += 1) quiet[i] = (quiet[i] ?? 0) * 0.1;
    expect(integratedLufs(loud)).toBeGreaterThan(integratedLufs(quiet));
  });

  it('normalizeToLufs converges near the target for a sustained signal', () => {
    const buf = pinkNoise(3, createRng('lufs-norm'), 48000);
    normalizeToLufs(buf, -16, 48000);
    expect(integratedLufs(buf, 48000)).toBeCloseTo(-16, 0);
  });

  it('handles very short buffers without throwing', () => {
    const buf = renderTone(0.05, 440, 'sine', 48000);
    expect(Number.isFinite(integratedLufs(buf))).toBe(true);
  });
});
