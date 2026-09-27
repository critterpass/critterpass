import { describe, expect, it } from 'vitest';

import { makeLoopSeamless, measureLoopSeam, mixTracks } from './mixer';
import { renderTone } from './oscillator';

describe('mixer', () => {
  it('mixTracks sums gains at the right offsets', () => {
    const out = mixTracks(6, [
      { buffer: new Float32Array([1, 1, 1]), gain: 1, startSample: 0 },
      { buffer: new Float32Array([1, 1, 1]), gain: 0.5, startSample: 2 },
    ]);
    expect(Array.from(out)).toEqual([1, 1, 1.5, 0.5, 0.5, 0]);
  });

  it('makeLoopSeamless forces an exact wrap match even for an arbitrary (non-periodic) tone', () => {
    // 440 Hz at 48 kHz over an arbitrary duration will not land on an exact period boundary, so the
    // crossfade alone cannot make a tonal signal sound seamless (that comes from bar-aligned
    // composition, see music/render-theme.ts) — but the hard wrap-sample match must always hold.
    const buf = renderTone(0.2033, 440, 'sine', 48000);
    makeLoopSeamless(buf, 2000);
    expect(measureLoopSeam(buf).wrapJump).toBe(0);
  });

  it('makeLoopSeamless keeps an already-periodic loop smooth at the wrap', () => {
    // An exact whole number of periods is already close to seamless (as a bar-aligned composition
    // would be); the crossfade should not introduce a new glitch on top of that.
    // 480 Hz divides 48 kHz exactly (100 samples/period), so a whole number of periods lands on an
    // exact sample boundary and the buffer is genuinely periodic, not just close due to rounding.
    const periods = 50;
    const freq = 480;
    const duration = periods / freq;
    const buf = renderTone(duration, freq, 'sine', 48000);
    const before = measureLoopSeam(buf);
    makeLoopSeamless(buf, 200);
    const after = measureLoopSeam(buf);
    expect(after.wrapJump).toBe(0);
    // The crossfade should not introduce a glitch materially worse than the signal's own natural
    // sample-to-sample slope (it is already periodic, so there was little to fix).
    expect(after.maxNeighbourJump).toBeLessThan(before.maxNeighbourJump * 3);
  });
});
