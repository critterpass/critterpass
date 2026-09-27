import { describe, expect, it } from 'vitest';

import { normalizeToTruePeak, truePeakDb } from './peak';
import { renderTone } from '../core/oscillator';

describe('peak', () => {
  it('reports 0 dBTP for a full-scale tone', () => {
    const buf = renderTone(0.1, 440, 'sine', 48000);
    expect(truePeakDb(buf)).toBeGreaterThan(-0.5);
    expect(truePeakDb(buf)).toBeLessThan(0.5);
  });

  it('normalizeToTruePeak hits the target within a small tolerance', () => {
    const buf = renderTone(0.1, 440, 'sine', 48000);
    normalizeToTruePeak(buf, -1);
    expect(truePeakDb(buf)).toBeCloseTo(-1, 0);
  });

  it('silence has a very low (not NaN/Infinity-crashing) peak', () => {
    const buf = new Float32Array(4800);
    expect(Number.isFinite(truePeakDb(buf))).toBe(true);
  });
});
