import { describe, expect, it } from '@jest/globals';

import {
  fitSegments,
  progressFraction,
  SEGMENT_FIT_FLOOR,
  segmentFrames,
  stepperCan,
  stepValue,
} from '../controls/control-logic';

describe('segmentFrames', () => {
  it('splits the track inside its padding evenly', () => {
    expect(segmentFrames(306, 3, [1, 1, 1])).toEqual([
      { x: 3, width: 100 },
      { x: 103, width: 100 },
      { x: 203, width: 100 },
    ]);
  });

  it('gives a weighted segment its share', () => {
    const frames = segmentFrames(350, 3, [1, 1.4, 1, 1]);
    const total = frames.reduce((sum, f) => sum + f.width, 0);
    expect(total).toBeCloseTo(344, 5);
    expect((frames[1]?.width ?? 0) / (frames[0]?.width ?? 1)).toBeCloseTo(1.4, 5);
    expect(frames[3]?.x).toBeCloseTo(3 + (344 * 3.4) / 4.4, 5);
  });

  it('collapses before the track is measured', () => {
    expect(segmentFrames(0, 3, [1, 1])).toEqual([
      { x: 3, width: 0 },
      { x: 3, width: 0 },
    ]);
  });
});

describe('stepper', () => {
  const bounds = { min: 1, max: 8 };

  it('moves one step and stops at the bounds', () => {
    expect(stepValue(6, 1, bounds)).toBe(7);
    expect(stepValue(8, 1, bounds)).toBe(8);
    expect(stepValue(1, -1, bounds)).toBe(1);
  });

  it('moves by a custom step without overshooting', () => {
    expect(stepValue(7, 1, { min: 0, max: 8, step: 5 })).toBe(8);
    expect(stepValue(3, -1, { min: 0, max: 8, step: 5 })).toBe(0);
  });

  it('disables the side that cannot move', () => {
    expect(stepperCan(1, bounds)).toEqual({ decrement: false, increment: true });
    expect(stepperCan(8, bounds)).toEqual({ decrement: true, increment: false });
    expect(stepperCan(4, bounds)).toEqual({ decrement: true, increment: true });
  });
});

describe('progressFraction', () => {
  it('clamps to the bar', () => {
    expect(progressFraction(4, 5)).toBe(0.8);
    expect(progressFraction(7, 5)).toBe(1);
    expect(progressFraction(-1, 5)).toBe(0);
    expect(progressFraction(1, 0)).toBe(0);
  });
});

describe('fitSegments', () => {
  const base = { width: 336, trackPad: 3, pad: 6 };

  it('keeps the given shares and full size when every label fits', () => {
    expect(fitSegments({ ...base, weights: [1, 1, 1], natural: [40, 60, 50] })).toEqual({
      weights: [1, 1, 1],
      scale: 1,
    });
  });

  it('shrinks every label alike when one is a little too long for its share', () => {
    // 110 inner per segment, 98 for a label: 110 / 105 ≈ 0.93.
    const fit = fitSegments({ ...base, weights: [1, 1, 1], natural: [40, 105, 50] });
    expect(fit.weights).toEqual([1, 1, 1]);
    expect(fit.scale).toBeCloseTo(98 / 105, 5);
  });

  it('sizes the segments to their labels when shrinking alone would go too small', () => {
    // "Hướng dẫn viên" beside short labels: equal shares would need 0.6.
    const fit = fitSegments({ ...base, weights: [1, 1, 1], natural: [40, 160, 50] });
    expect(fit.scale).toBe(1);
    expect(fit.weights).toEqual([52, 172, 62]);
  });

  it('sizes the segments to their labels before shrinking them past a step', () => {
    // "Nói nhiều" beside "Ít nói": equal shares would need 0.85; label shares keep full size.
    const fit = fitSegments({ ...base, weights: [1, 1, 1], natural: [60, 129, 70] });
    expect(fit.scale).toBe(1);
    expect(fit.weights).toEqual([72, 141, 82]);
  });

  it('never shrinks below the floor', () => {
    const fit = fitSegments({ ...base, weights: [1, 1], natural: [300, 300] });
    expect(fit.scale).toBe(SEGMENT_FIT_FLOOR);
  });

  it('waits for the track and every label to be measured', () => {
    expect(fitSegments({ ...base, width: 0, weights: [1, 1], natural: [10, 10] }).scale).toBe(1);
    expect(fitSegments({ ...base, weights: [1, 1], natural: [10, undefined] }).scale).toBe(1);
  });
});
