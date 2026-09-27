import { describe, expect, it } from 'vitest';

import { createRng } from './prng';
import { brownNoise, pinkNoise, whiteNoise } from './noise';

describe('noise', () => {
  it('whiteNoise is deterministic per seed and bounded', () => {
    const a = whiteNoise(0.05, createRng('noise'), 48000);
    const b = whiteNoise(0.05, createRng('noise'), 48000);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.every((v) => v >= -1 && v <= 1)).toBe(true);
  });

  it('pinkNoise and brownNoise produce finite, non-degenerate signals', () => {
    for (const buf of [
      pinkNoise(0.2, createRng('pink'), 48000),
      brownNoise(0.2, createRng('brown'), 48000),
    ]) {
      expect(buf.every((v) => Number.isFinite(v))).toBe(true);
      const peak = Math.max(...Array.from(buf).map(Math.abs));
      expect(peak).toBeGreaterThan(0);
    }
  });

  it('brownNoise has more low-frequency energy (smoother) than white noise', () => {
    const white = whiteNoise(0.5, createRng('cmp'), 48000);
    const brown = brownNoise(0.5, createRng('cmp'), 48000);
    const meanAbsDiff = (buf: Float32Array): number => {
      let sum = 0;
      for (let i = 1; i < buf.length; i += 1) sum += Math.abs((buf[i] ?? 0) - (buf[i - 1] ?? 0));
      return sum / buf.length;
    };
    expect(meanAbsDiff(brown)).toBeLessThan(meanAbsDiff(white));
  });
});
