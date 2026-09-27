import { describe, expect, it } from 'vitest';

import {
  closureExcludePoints,
  MAX_EXCLUDE_POINTS,
  pointInRing,
  routeCrossesClosures,
} from '../../src/routing/closures';
import type { ClosureRing } from '../../src/routing/provider';

const square = (lng: number, lat: number, size: number): ClosureRing => [
  [lng, lat],
  [lng + size, lat],
  [lng + size, lat + size],
  [lng, lat + size],
  [lng, lat],
];

describe('closure sampling', () => {
  it('tests points against a ring', () => {
    const ring = square(135.76, 34.98, 0.01);
    expect(pointInRing({ lng: 135.765, lat: 34.985 }, ring)).toBe(true);
    expect(pointInRing({ lng: 135.775, lat: 34.985 }, ring)).toBe(false);
  });

  it('samples the ring vertices plus interior points, all inside or on the ring', () => {
    const ring = square(135.76, 34.98, 0.01);
    const points = closureExcludePoints([ring]);
    expect(points.length).toBeGreaterThan(4);
    expect(points).toContainEqual({ lng: 135.76, lat: 34.98 });
    for (const point of points) {
      expect(point.lng).toBeGreaterThanOrEqual(135.76);
      expect(point.lng).toBeLessThanOrEqual(135.77);
    }
  });

  it('never exceeds the Mapbox exclude budget across many rings', () => {
    const rings = Array.from({ length: 5 }, (_, index) => square(135.7 + index * 0.02, 35, 0.01));
    const points = closureExcludePoints(rings);
    expect(points.length).toBeLessThanOrEqual(MAX_EXCLUDE_POINTS);
    // Every ring keeps a share of the budget.
    for (const ring of rings) {
      expect(
        points.some(
          (point) =>
            pointInRing(point, ring) ||
            ring.some(([lng, lat]) => lng === point.lng && lat === point.lat),
        ),
      ).toBe(true);
    }
  });

  it('ignores degenerate rings', () => {
    expect(closureExcludePoints([[[135, 35]]])).toEqual([]);
  });

  it('detects a route passing through a closure', () => {
    const ring = square(135.76, 34.98, 0.01);
    expect(
      routeCrossesClosures(
        [
          [135.75, 34.985],
          [135.765, 34.985],
        ],
        [ring],
      ),
    ).toBe(true);
    expect(
      routeCrossesClosures(
        [
          [135.75, 34.985],
          [135.755, 34.985],
        ],
        [ring],
      ),
    ).toBe(false);
  });
});
