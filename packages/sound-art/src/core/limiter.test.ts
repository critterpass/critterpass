import { describe, expect, it } from 'vitest';

import { computeLookaheadGain, lookaheadLimit } from './limiter';
import { dbToLinear, peakAbs } from './signal';

describe('lookaheadLimit', () => {
  it('never lets a hot signal exceed the ceiling', () => {
    const buf = new Float32Array(48000);
    for (let i = 0; i < buf.length; i += 1) buf[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 3;
    lookaheadLimit(buf, { ceilingDb: -1 });
    expect(peakAbs(buf)).toBeLessThanOrEqual(dbToLinear(-1) * 1.0001);
  });

  it('leaves a signal already under the ceiling untouched', () => {
    const buf = new Float32Array(4800);
    for (let i = 0; i < buf.length; i += 1)
      buf[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.1;
    const before = Float32Array.from(buf);
    lookaheadLimit(buf, { ceilingDb: -1 });
    for (let i = 0; i < buf.length; i += 1) {
      expect(buf[i]).toBeCloseTo(before[i] as number, 5);
    }
  });

  it('reduces gain only around an isolated transient and recovers smoothly (no pumping)', () => {
    // A single decaying "pluck"-like transient in an otherwise silent buffer, well above ceiling.
    const n = 48000;
    const buf = new Float32Array(n);
    const spikeStart = 10000;
    for (let i = 0; i < 2000; i += 1) {
      buf[spikeStart + i] = Math.sin((2 * Math.PI * 300 * i) / 48000) * Math.exp(-i / 400) * 3;
    }
    const gain = computeLookaheadGain(buf, { ceilingDb: -1, lookaheadSec: 0.005, releaseSec: 0.1 });

    // Far from the transient, gain should be (approximately) unity.
    expect(gain[100]).toBeCloseTo(1, 3);
    expect(gain[n - 100]).toBeCloseTo(1, 3);

    // No pumping: once gain starts recovering (release) after the transient's peak, it should rise
    // monotonically back toward 1 rather than dip-recover-dip repeatedly.
    let peakIdx = 0;
    let minGainSeen = 1;
    for (let i = spikeStart; i < spikeStart + 4000; i += 1) {
      if ((gain[i] as number) < minGainSeen) {
        minGainSeen = gain[i] as number;
        peakIdx = i;
      }
    }
    let prev = gain[peakIdx] as number;
    let regressions = 0;
    for (let i = peakIdx + 1; i < spikeStart + 20000 && i < n; i += 1) {
      const g = gain[i] as number;
      if (g < prev - 1e-6) regressions += 1;
      prev = Math.max(prev, g);
    }
    expect(regressions).toBe(0);
    expect(minGainSeen).toBeLessThan(1);
  });

  it('is deterministic', () => {
    const buf = new Float32Array(4800);
    for (let i = 0; i < buf.length; i += 1) buf[i] = Math.sin((2 * Math.PI * 220 * i) / 48000) * 2;
    const a = Float32Array.from(buf);
    const b = Float32Array.from(buf);
    lookaheadLimit(a, { ceilingDb: -1 });
    lookaheadLimit(b, { ceilingDb: -1 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('produces finite output with no NaN', () => {
    const buf = new Float32Array(4800);
    for (let i = 0; i < buf.length; i += 1) buf[i] = Math.sin((2 * Math.PI * 550 * i) / 48000) * 5;
    lookaheadLimit(buf, { ceilingDb: -1 });
    expect(buf.every((v) => Number.isFinite(v))).toBe(true);
  });
});
