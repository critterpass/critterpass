import { describe, expect, it } from 'vitest';

import { loadDesignDoodlesMath, loadDesignShapeMath } from './design-math-reference';
import type { Point } from './geometry';
import {
  blobPolygon,
  catmullRomResample,
  ellipsePolygon,
  fluffPolygon,
  quadraticBezier,
  superellipseArc,
  tubeOutline,
} from './shapes';

const designDoodles = loadDesignDoodlesMath();
const designShapes = loadDesignShapeMath();

/** Deterministic open polyline of `count` points, varied by `offset` so fixtures never collide. */
function openPolyline(count: number, offset = 0): Point[] {
  return Array.from({ length: count }, (_, i): Point => [
    10 + i * 7 + offset,
    50 + Math.sin(i * 0.8 + offset) * 20 * Math.cos(i - offset),
  ]);
}

describe('ellipsePolygon', () => {
  it('matches design E across radii, segment counts and rotations', () => {
    let cases = 0;
    for (const rx of [1, 5.5, 18, 40]) {
      for (const ry of [1, 5.5, 18, 40]) {
        for (const n of [8, 10, 12, 14, 16]) {
          for (const rot of [0, 0.4, -1.1, Math.PI]) {
            expect(ellipsePolygon(31, 62, rx, ry, n, rot)).toEqual(
              designDoodles.E(31, 62, rx, ry, n, rot),
            );
            cases++;
          }
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });

  it('matches design defaults', () => {
    expect(ellipsePolygon(50, 50, 10, 8)).toEqual(designDoodles.E(50, 50, 10, 8));
  });
});

describe('superellipseArc', () => {
  it('matches design arcB across exponents, radii and angle ranges', () => {
    let cases = 0;
    const ranges: ReadonlyArray<readonly [number, number]> = [
      [0, 6.28],
      [0.3, 2.9],
      [-1.95, 1.95],
      [3.3, 6.12],
    ];
    for (const e of [0.6, 0.8, 1, 1.4]) {
      for (const [a0, a1] of ranges) {
        for (const n of [8, 10, 12, 14, 22]) {
          expect(superellipseArc(50, 50, 20, 15, e, a0, a1, n)).toEqual(
            designShapes.arcB(50, 50, 20, 15, e, a0, a1, n),
          );
          cases++;
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });
});

describe('blobPolygon', () => {
  it('matches design blob across radii, exponents and segment counts', () => {
    let cases = 0;
    for (const rx of [6, 14, 27]) {
      for (const ry of [6, 14, 27]) {
        for (const e of [0.7, 0.8, 0.85, 0.9, 0.95]) {
          for (const n of [10, 12, 14, 16, 18]) {
            expect(blobPolygon(50, 60, rx, ry, e, n)).toEqual(
              designShapes.blob(50, 60, rx, ry, e, n),
            );
            cases++;
          }
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });

  it('matches design defaults', () => {
    expect(blobPolygon(50, 50, 20, 15)).toEqual(designShapes.blob(50, 50, 20, 15));
  });
});

describe('fluffPolygon', () => {
  it('matches design fluff across radii, point counts and amplitudes', () => {
    let cases = 0;
    for (const rx of [3.4, 6, 9]) {
      for (const ry of [3.4, 6, 9]) {
        for (const n of [4, 5, 6, 8]) {
          for (const amp of [0.15, 0.2, 0.3, 0.4, 0.45]) {
            expect(fluffPolygon(50, 50, rx, ry, n, amp)).toEqual(
              designShapes.fluff(50, 50, rx, ry, n, amp),
            );
            cases++;
          }
        }
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });
});

/** Deterministic control-point triples covering short, long and asymmetric curves. */
function bezierTriple(i: number): readonly [Point, Point, Point] {
  const a = i * 0.9;
  return [
    [50 + Math.cos(a) * 30, 50 + Math.sin(a) * 30],
    [50 + Math.cos(a + 1) * 45, 50 + Math.sin(a + 1) * 10],
    [50 + Math.cos(a + 2) * 15, 50 + Math.sin(a + 2) * 40],
  ];
}

describe('quadraticBezier', () => {
  it('matches design bez across control points and segment counts', () => {
    let cases = 0;
    for (let i = 0; i < 10; i++) {
      const [p0, p1, p2] = bezierTriple(i);
      for (const n of [2, 4, 6, 8, 10, 12]) {
        expect(quadraticBezier(p0, p1, p2, n)).toEqual(designShapes.bez(p0, p1, p2, n));
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });
});

describe('catmullRomResample', () => {
  it('matches design crs across polylines and subdivision counts', () => {
    let cases = 0;
    for (let count = 3; count <= 14; count++) {
      const points = openPolyline(count);
      for (const per of [2, 3, 4, 5, 6]) {
        expect(catmullRomResample(points, per)).toEqual(designShapes.crs(points, per));
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });
});

describe('tubeOutline', () => {
  it('matches design tube across centrelines and width pairs', () => {
    let cases = 0;
    const widthPairs: ReadonlyArray<readonly [number, number]> = [
      [4, 4],
      [6, 3],
      [3, 6],
      [9, 5],
      [5, 9],
    ];
    for (let count = 2; count <= 12; count++) {
      const points = openPolyline(count, 20);
      for (const [w0, w1] of widthPairs) {
        const expected = designShapes.tube(points, w0, w1);
        const actual = tubeOutline(points, w0, w1);
        expect(actual.left).toEqual(expected.L);
        expect(actual.right).toEqual(expected.R);
        expect(actual.polygon).toEqual(expected.P);
        cases++;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(50);
  });
});
