import { describe, expect, it } from 'vitest';

import { loadDesignDoodlesMath } from './design-math-reference';
import type { Point } from './geometry';
import { catmullRomSpline } from './spline';

/** Deterministic wobbly polygon so shapes vary with `count`/`radius`/`phase` but never use Math.random. */
function polygon(count: number, radius: number, phase: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => {
    const a = phase + (i / count) * Math.PI * 2;
    const wobble = 1 + 0.3 * Math.sin(a * 3 + phase);
    return [50 + Math.cos(a) * radius * wobble, 50 + Math.sin(a) * radius * wobble];
  });
}

describe('catmullRomSpline', () => {
  const design = loadDesignDoodlesMath();

  it('matches the design tessellation exactly across shapes, closures and steps', () => {
    let cases = 0;
    for (let count = 3; count <= 12; count++) {
      for (const radius of [4, 18, 40]) {
        const points = polygon(count, radius, count * 0.37);
        for (const close of [true, false]) {
          for (const step of [1.1, 0.6, 3]) {
            expect(catmullRomSpline(points, close, step)).toEqual(design.spl(points, close, step));
            cases++;
          }
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });

  it('matches the design default step', () => {
    const points = polygon(6, 20, 0.1);
    expect(catmullRomSpline(points, true)).toEqual(design.spl(points, true));
  });

  it('returns the input verbatim for fewer than two points', () => {
    expect(catmullRomSpline([], true)).toEqual([]);
    expect(catmullRomSpline([[1, 2]], true)).toEqual([[1, 2]]);
  });
});
