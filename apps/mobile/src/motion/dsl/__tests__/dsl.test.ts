import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';

import designSamples from '../__fixtures__/design-samples.json';
import { compileKeyframes } from '../compile';
import { parseKeyframes } from '../parse';

const fixtureNames = Object.keys(designSamples) as ReadonlyArray<keyof typeof designSamples>;

describe('parseKeyframes', () => {
  it('parses every design fixture without throwing', () => {
    for (const name of fixtureNames) {
      expect(() => parseKeyframes(designSamples[name])).not.toThrow();
    }
  });

  it('round-trips the exact numbers written in the design string', () => {
    const stops = parseKeyframes(designSamples.popInBackEasingWithPreviewLoopTail);
    expect(stops[0]).toEqual({ at: 0, assignments: { s: 0.2, o: 0, r: -24, easingAlias: 'back' } });
    expect(stops[1]).toEqual({ at: 0.12, assignments: { s: 1.12, o: 1, r: 5 } });
    expect(stops[2]).toEqual({ at: 0.2, assignments: { s: 1, r: 0 } });
  });

  it('rejects a segment with no ":"', () => {
    expect(() => parseKeyframes('0 o1')).toThrow(/missing ":"/);
  });

  it('rejects a time outside 0-1', () => {
    expect(() => parseKeyframes('1.5:o1')).toThrow(/between 0 and 1/);
  });

  it('rejects an unrecognised token', () => {
    expect(() => parseKeyframes('0:zz1')).toThrow(/unrecognised keyframe token/);
  });

  it('rejects an empty easing alias', () => {
    expect(() => parseKeyframes('0:o1 e=')).toThrow(/empty easing alias/);
  });
});

describe('compileKeyframes', () => {
  it('compiles every design fixture (with and without once) without throwing', () => {
    for (const name of fixtureNames) {
      expect(() => compileKeyframes(designSamples[name])).not.toThrow();
      expect(() => compileKeyframes(designSamples[name], { once: true })).not.toThrow();
    }
  });

  it("applies carry-forward: an unmentioned prop keeps the previous stop's resolved value", () => {
    const stops = compileKeyframes(designSamples.popInBackEasingWithPreviewLoopTail);
    // stop 2 (.2) sets s and r but not o or tx/ty — o carries from stop 1 (o1), tx/ty stay identity.
    expect(stops[2]?.transform).toEqual({ tx: 0, ty: 0, r: 0, sx: 1, sy: 1, o: 1 });
  });

  it('expands a uniform "s" to both sx and sy', () => {
    const stops = compileKeyframes('0:s.2;1:s1');
    expect(stops[0]?.transform).toMatchObject({ sx: 0.2, sy: 0.2 });
    expect(stops[1]?.transform).toMatchObject({ sx: 1, sy: 1 });
  });

  it('lets an explicit sx/sy in the same stop override a uniform "s"', () => {
    const stops = compileKeyframes('0:s1 sy.94;1:s1');
    expect(stops[0]?.transform).toMatchObject({ sx: 1, sy: 0.94 });
  });

  it('resolves every design easing alias to its named motion token (default: inOut)', () => {
    // `e=` is written on the stop a transition *leaves from* (e.g. the design's own
    // `0:sx0 e=lin;1:sx1`), so it is stop 0's `easing` that governs the 0->1 segment here.
    expect(compileKeyframes('0:o0 e=back;1:o1')[0]?.easing).toEqual({
      kind: 'bezier',
      bezier: tokens.motion.easing.back,
    });
    expect(compileKeyframes('0:o0 e=in;1:o1')[0]?.easing).toEqual({
      kind: 'bezier',
      bezier: tokens.motion.easing.enter,
    });
    expect(compileKeyframes('0:o0 e=out;1:o1')[0]?.easing).toEqual({
      kind: 'bezier',
      bezier: tokens.motion.easing.exit,
    });
    expect(compileKeyframes('0:o0 e=io;1:o1')[0]?.easing).toEqual({
      kind: 'bezier',
      bezier: tokens.motion.easing.inOut,
    });
    expect(compileKeyframes('0:o0 e=lin;1:o1')[0]?.easing).toEqual({ kind: 'linear' });
    expect(compileKeyframes('0:o0;1:o1')[0]?.easing).toEqual({
      kind: 'bezier',
      bezier: tokens.motion.easing.inOut,
    });
  });

  it('rejects an unknown easing alias', () => {
    expect(() => compileKeyframes('0:o0 e=nope;1:o1')).toThrow(/unknown easing alias/);
  });

  describe("once (strips the design tool's preview-loop tail)", () => {
    it('truncates after the last stop still at peak opacity, then renormalizes to 0-1', () => {
      const stops = compileKeyframes(designSamples.popInBackEasingWithPreviewLoopTail, {
        once: true,
      });
      // Original stops before .9 (peak, last at o1) are 0, .12, .2, .9 — renormalized by /.9.
      expect(stops).toHaveLength(4);
      expect(stops.map((stop) => stop.at)).toEqual([0, 0.12 / 0.9, 0.2 / 0.9, 1]);
      expect(stops[stops.length - 1]?.transform).toEqual({
        tx: 0,
        ty: 0,
        r: 0,
        sx: 1,
        sy: 1,
        o: 1,
      });
    });

    it('truncates a busier multi-property sequence the same way', () => {
      const stops = compileKeyframes(designSamples.holdPopFadeWithPreviewLoopTail, { once: true });
      expect(stops[stops.length - 1]?.at).toBe(1);
      expect(stops[stops.length - 1]?.transform.o).toBe(1);
      expect(stops.some((stop) => stop.transform.o === 0 && stop.at === 1)).toBe(false);
    });

    it('is a no-op when the sequence already ends at its opacity peak', () => {
      for (const name of [
        'popInBackEasingEndsAtPeak',
        'fadeOutThenBackIn',
        'enterEasingSettleEndsAtPeak',
        'enterEasingWithRotationEndsAtPeak',
      ] as const) {
        const withOnce = compileKeyframes(designSamples[name], { once: true });
        const withoutOnce = compileKeyframes(designSamples[name]);
        expect(withOnce).toEqual(withoutOnce);
      }
    });

    it('is a no-op for a sequence that never mentions opacity', () => {
      const withOnce = compileKeyframes(designSamples.holdThenRotateBump, { once: true });
      const withoutOnce = compileKeyframes(designSamples.holdThenRotateBump);
      expect(withOnce).toEqual(withoutOnce);
    });
  });
});
