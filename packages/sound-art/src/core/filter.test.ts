import { describe, expect, it } from 'vitest';

import { biquadCoeffs, applyBiquad } from './filter';
import { renderTone } from './oscillator';

function rms(buf: Float32Array): number {
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.sqrt(sum / buf.length);
}

describe('filter', () => {
  it('lowpass attenuates a tone well above cutoff more than one well below', () => {
    const low = renderTone(0.2, 200, 'sine', 48000);
    const high = renderTone(0.2, 8000, 'sine', 48000);
    const coeffs = biquadCoeffs('lowpass', 1000, 0.707, 0, 48000);
    const lowOut = applyBiquad(low, coeffs);
    const highOut = applyBiquad(high, coeffs);
    // Skip the filter's settling transient at the very start.
    const settle = 1000;
    expect(rms(highOut.subarray(settle))).toBeLessThan(rms(lowOut.subarray(settle)) * 0.2);
  });

  it('highpass attenuates a tone well below cutoff more than one well above', () => {
    const low = renderTone(0.2, 100, 'sine', 48000);
    const high = renderTone(0.2, 6000, 'sine', 48000);
    const coeffs = biquadCoeffs('highpass', 1000, 0.707, 0, 48000);
    const lowOut = applyBiquad(low, coeffs);
    const highOut = applyBiquad(high, coeffs);
    const settle = 1000;
    expect(rms(lowOut.subarray(settle))).toBeLessThan(rms(highOut.subarray(settle)) * 0.2);
  });

  it('produces finite output with no NaN for all filter types', () => {
    const types = [
      'lowpass',
      'highpass',
      'bandpass',
      'notch',
      'peaking',
      'lowshelf',
      'highshelf',
      'allpass',
    ] as const;
    const tone = renderTone(0.05, 500, 'saw', 48000);
    for (const type of types) {
      const out = applyBiquad(tone, biquadCoeffs(type, 1000, 1, 6, 48000));
      expect(out.every((v) => Number.isFinite(v))).toBe(true);
    }
  });
});
