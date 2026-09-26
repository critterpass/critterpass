import { describe, expect, it } from 'vitest';

import { arcLength, type Point } from './geometry';
import { loadDesignDoodlesMath } from './design-math-reference';

function openPolyline(count: number, offset: number): Point[] {
  return Array.from({ length: count }, (_, i): Point => [
    i * 5 + offset,
    Math.sin(i * 0.6 + offset) * 15,
  ]);
}

describe('arcLength', () => {
  const design = loadDesignDoodlesMath();

  it('matches design len across many polylines', () => {
    let cases = 0;
    for (let count = 2; count <= 20; count++) {
      for (const offset of [0, 1.5, 7, 12.25]) {
        const points = openPolyline(count, offset);
        expect(arcLength(points)).toBe(design.len(points));
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });

  it('is zero for a single point', () => {
    expect(arcLength([[3, 4]])).toBe(0);
  });
});
