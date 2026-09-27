import { describe, expect, it } from 'vitest';

import { linearSweep, oscillatorSample, renderOscillator, renderTone } from './oscillator';

describe('oscillator', () => {
  it('sine/triangle/saw/square/pulse samples stay within [-1, 1]', () => {
    for (const waveform of ['sine', 'triangle', 'saw', 'square', 'pulse'] as const) {
      for (let p = 0; p < 1; p += 0.05) {
        const v = oscillatorSample(waveform, p);
        expect(v).toBeGreaterThanOrEqual(-1.0001);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('renderTone produces the requested number of samples with no NaN', () => {
    const buf = renderTone(0.1, 440, 'sine', 48000);
    expect(buf.length).toBe(4800);
    expect(buf.some((v) => Number.isNaN(v))).toBe(false);
  });

  it('renderOscillator with a sweep stays continuous (no huge sample-to-sample jump)', () => {
    const sweep = linearSweep(200, 2000, 0.2);
    const buf = renderOscillator(0.2, sweep, 'sine', { sampleRate: 48000 });
    let maxJump = 0;
    for (let i = 1; i < buf.length; i += 1) {
      maxJump = Math.max(maxJump, Math.abs((buf[i] ?? 0) - (buf[i - 1] ?? 0)));
    }
    expect(maxJump).toBeLessThan(0.6);
  });

  it('is deterministic for identical inputs', () => {
    const a = renderTone(0.05, 300, 'saw');
    const b = renderTone(0.05, 300, 'saw');
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
