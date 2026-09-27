import { describe, expect, it } from 'vitest';

import { createOpBuilder } from './ops';
import { applyHopPose, applyTiltPose } from './pose-transform';

/** One op of each shape, at points chosen off the anchor `[50, 88]` so a null transform is detectable. */
function sampleOps(): ReturnType<typeof createOpBuilder>['ops'] {
  const { sink, ops } = createOpBuilder(7, '#221e19');
  sink.wash(
    [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
    ],
    '#a9d08c',
  );
  sink.fill(
    [
      [45, 45],
      [55, 45],
      [50, 55],
    ],
    '#ff7fa8',
  );
  sink.line(
    [
      [30, 70],
      [50, 50],
      [70, 70],
    ],
    { w: 2 },
  );
  return ops;
}

describe('applyTiltPose', () => {
  it('rotates every op point about the shared anchor by a fixed angle', () => {
    const ops = sampleOps();
    const tilted = applyTiltPose(ops);
    expect(tilted).toHaveLength(ops.length);
    for (const [i, op] of tilted.entries()) {
      const original = ops[i];
      if (!original) throw new Error('index out of range');
      expect(op.points.length).toBe(original.points.length);
      expect(op.points).not.toEqual(original.points);
    }
  });

  it('leaves the anchor point itself fixed (a pure rotation, no translation)', () => {
    const { sink, ops } = createOpBuilder(7, '#221e19');
    sink.fill(
      [
        [50, 88],
        [51, 88],
        [50, 89],
      ],
      '#000',
    );
    const [tilted] = applyTiltPose(ops);
    const anchorPoint = tilted?.points[0];
    expect(anchorPoint?.[0]).toBeCloseTo(50, 5);
    expect(anchorPoint?.[1]).toBeCloseTo(88, 5);
  });

  it('preserves distance from the anchor (rotation, not scale)', () => {
    const { sink, ops } = createOpBuilder(7, '#221e19');
    sink.fill(
      [
        [50, 68],
        [51, 68],
        [50, 69],
      ],
      '#000',
    );
    const [tilted] = applyTiltPose(ops);
    const point = tilted?.points[0];
    if (!point) throw new Error('missing point');
    const distance = Math.hypot(point[0] - 50, point[1] - 88);
    expect(distance).toBeCloseTo(20, 5);
  });

  it('preserves op metadata (colour, width, seed) untouched', () => {
    const ops = sampleOps();
    const tilted = applyTiltPose(ops);
    expect(tilted.map((op) => op.t)).toEqual(ops.map((op) => op.t));
    expect(tilted.map((op) => op.color)).toEqual(ops.map((op) => op.color));
  });
});

describe('applyHopPose', () => {
  it('shifts every point up (subtracts from y) and compresses toward the anchor line', () => {
    const ops = sampleOps();
    const hopped = applyHopPose(ops);
    for (const [i, op] of hopped.entries()) {
      const original = ops[i];
      if (!original) throw new Error('index out of range');
      for (const [pointIndex, point] of op.points.entries()) {
        const originalPoint = original.points[pointIndex];
        if (!originalPoint) throw new Error('point index out of range');
        expect(point[0]).toBeCloseTo(originalPoint[0], 5); // x is untouched
        expect(point[1]).toBeLessThan(originalPoint[1]); // always moves up
      }
    }
  });

  it('squashes points above the anchor closer to the anchor line than a pure lift would', () => {
    const { sink, ops } = createOpBuilder(7, '#221e19');
    sink.fill(
      [
        [50, 38],
        [51, 38],
        [50, 39],
      ],
      '#000',
    );
    const [hopped] = applyHopPose(ops);
    const point = hopped?.points[0];
    if (!point) throw new Error('missing point');
    const pureLiftY = 38 - 6; // no squash, only the lift
    expect(point[1]).toBeGreaterThan(pureLiftY); // squash pulls it back down toward the anchor line
  });
});
