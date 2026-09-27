import { describe, expect, it } from 'vitest';

import { compress, delayEffect, schroederReverb, softLimiter } from './effects';
import { renderTone } from './oscillator';
import { peakAbs } from './signal';

describe('effects', () => {
  it('delayEffect produces a longer, finite tail', () => {
    const dry = renderTone(0.05, 440, 'sine', 48000);
    const out = delayEffect(dry, 0.02, 0.4, 0.5, 48000);
    expect(out.length).toBeGreaterThan(dry.length);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('schroederReverb extends the buffer with a finite, bounded tail', () => {
    const dry = renderTone(0.05, 440, 'sine', 48000);
    const out = schroederReverb(dry, { sampleRate: 48000 });
    expect(out.length).toBeGreaterThan(dry.length);
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    expect(peakAbs(out)).toBeLessThan(2);
  });

  it('softLimiter keeps output within the ceiling even for a hot input', () => {
    const hot = renderTone(0.05, 440, 'sine', 48000);
    for (let i = 0; i < hot.length; i += 1) hot[i] = (hot[i] ?? 0) * 3;
    softLimiter(hot, 0.95);
    expect(peakAbs(hot)).toBeLessThanOrEqual(0.95);
  });

  describe('compress', () => {
    it('reduces the sustained level of a signal already well above threshold', () => {
      // A steady tone gives the envelope follower time to settle, which is this compressor's
      // intended use (bus/glue compression on sustained material) — see the note on transients below.
      const buf = renderTone(1.5, 440, 'sine', 48000);
      for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) * 0.9;
      compress(buf, {
        thresholdDb: -12,
        ratio: 4,
        attackSec: 0.005,
        releaseSec: 0.05,
        makeupDb: 0,
      });
      // Settled region (well past the attack ramp-up): should be meaningfully quieter than the input.
      const settled = buf.subarray(buf.length - 4800);
      expect(peakAbs(settled)).toBeLessThan(0.6);
    });

    it('never produces non-finite output', () => {
      const buf = renderTone(0.3, 220, 'saw', 48000);
      compress(buf, { thresholdDb: -20, ratio: 2, attackSec: 0.01, releaseSec: 0.1, makeupDb: 3 });
      expect(buf.every((v) => Number.isFinite(v))).toBe(true);
    });

    it('has no effect below the threshold (aside from makeup gain)', () => {
      const buf = renderTone(0.2, 440, 'sine', 48000);
      for (let i = 0; i < buf.length; i += 1) buf[i] = (buf[i] ?? 0) * 0.001; // far below any sane threshold
      const before = peakAbs(buf);
      compress(buf, { thresholdDb: -6, ratio: 4, attackSec: 0.01, releaseSec: 0.1, makeupDb: 0 });
      expect(peakAbs(buf)).toBeCloseTo(before, 3);
    });
  });
});
