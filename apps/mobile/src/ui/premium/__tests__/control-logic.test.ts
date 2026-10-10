import { describe, expect, it } from '@jest/globals';

import { progressFraction, segmentFrames, stepperCan, stepValue } from '../controls/control-logic';

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
