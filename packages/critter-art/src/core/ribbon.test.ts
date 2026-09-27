import { describe, expect, it } from 'vitest';

import { createRecordingCanvas, loadDesignDoodlesMath } from './design-math-reference';
import type { Point } from './geometry';
import { ribbonOutline, ribbonPolygon } from './ribbon';

/** Deterministic open stroke path, varied by `offset` so fixtures never collide across seeds. */
function strokePath(count: number, offset: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => [
    20 + i * 6 + offset,
    50 + Math.sin(i * 0.5 + offset) * 18,
  ]);
}

function expectPointsClose(
  actual: readonly Point[],
  expected: readonly Point[],
  epsilon: number,
): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(Math.abs(actual[i]![0] - expected[i]![0])).toBeLessThan(epsilon);
    expect(Math.abs(actual[i]![1] - expected[i]![1])).toBeLessThan(epsilon);
  }
}

describe('ribbonPolygon', () => {
  const design = loadDesignDoodlesMath();

  it('matches the design ribbon fill polygon across seeds, widths and pressure modes', () => {
    let cases = 0;
    const pressureModes: ReadonlyArray<readonly [boolean, boolean]> = [
      [false, false],
      [false, true],
      [true, false],
    ];
    for (let seed = 0; seed < 20; seed++) {
      for (const points of [strokePath(5, seed), strokePath(9, seed), strokePath(14, seed)]) {
        for (const [close, taper] of pressureModes) {
          const options = { seed, amp: 0.45, w: 3, minW: 1.05, close, taper };
          const ctx = createRecordingCanvas();
          design.ribbon(ctx, points, points.length, options);
          const actual = ribbonOutline(ribbonPolygon(points, points.length, options));
          expectPointsClose(actual, ctx.points, 1e-5);
          cases++;
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });

  it('matches the design ribbon when a draw-on budget truncates the point list', () => {
    const fullPoints = strokePath(14, 3);
    const truncated = fullPoints.slice(0, 6);
    const options = { seed: 11, amp: 0.3, w: 5, minW: 1.05, close: false, taper: true };
    const ctx = createRecordingCanvas();
    design.ribbon(ctx, truncated, fullPoints.length, options);
    const actual = ribbonOutline(ribbonPolygon(truncated, fullPoints.length, options));
    expectPointsClose(actual, ctx.points, 1e-5);
  });

  it('draws nothing for fewer than two points', () => {
    expect(
      ribbonPolygon([[1, 1]], 1, { seed: 1, amp: 0.1, w: 1, minW: 1, close: false, taper: false }),
    ).toEqual({ left: [], right: [] });
  });
});
