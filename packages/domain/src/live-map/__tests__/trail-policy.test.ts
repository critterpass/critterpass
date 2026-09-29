import { describe, expect, it } from 'vitest';

import {
  appendTrailPoint,
  EMPTY_TRAIL,
  isMovingFast,
  trailOpacity,
  TRAIL_FADE_MS,
  TRAIL_WINDOW_MS,
  visibleTrailPoints,
} from '../trail-policy';

const T = Date.parse('2026-10-18T09:00:00Z');

describe('trail policy', () => {
  it('counts scooters, cars and bikes as fast, and walkers only above 4 m/s', () => {
    const a = { lat: -8.5, lng: 115.26, at: T };
    const slow = { lat: -8.50009, lng: 115.26, at: T + 5000 }; // ~10 m in 5 s
    const quick = { lat: -8.5005, lng: 115.26, at: T + 5000 }; // ~55 m in 5 s
    expect(isMovingFast('automotive', undefined, a)).toBe(true);
    expect(isMovingFast('cycling', undefined, a)).toBe(true);
    expect(isMovingFast('walking', a, slow)).toBe(false);
    expect(isMovingFast('walking', a, quick)).toBe(true);
  });

  it('holds at most five minutes of points', () => {
    let trail = EMPTY_TRAIL;
    for (let i = 0; i <= 12; i++) {
      trail = appendTrailPoint(
        trail,
        { lat: -8.5 - i * 0.001, lng: 115.26, at: T + i * 30_000 },
        'automotive',
      );
    }
    const oldest = trail.points[0]!.at;
    const newest = trail.points[trail.points.length - 1]!.at;
    expect(newest - oldest).toBeLessThanOrEqual(TRAIL_WINDOW_MS);
    expect(visibleTrailPoints(trail, newest + TRAIL_WINDOW_MS + 1)).toEqual([]);
  });

  it('fades out over 30 s after the last fast fix', () => {
    let trail = appendTrailPoint(EMPTY_TRAIL, { lat: -8.5, lng: 115.26, at: T }, 'automotive');
    trail = appendTrailPoint(trail, { lat: -8.501, lng: 115.26, at: T + 5000 }, 'automotive');
    trail = appendTrailPoint(trail, { lat: -8.501, lng: 115.26, at: T + 10_000 }, 'stationary');
    expect(trailOpacity(trail, T + 5000)).toBe(1);
    expect(trailOpacity(trail, T + 5000 + TRAIL_FADE_MS / 2)).toBeCloseTo(0.5);
    expect(trailOpacity(trail, T + 5000 + TRAIL_FADE_MS)).toBe(0);
  });

  it('draws nothing for someone who never moved fast', () => {
    let trail = appendTrailPoint(EMPTY_TRAIL, { lat: -8.5, lng: 115.26, at: T }, 'walking');
    trail = appendTrailPoint(trail, { lat: -8.50001, lng: 115.26, at: T + 5000 }, 'walking');
    expect(trailOpacity(trail, T + 5000)).toBe(0);
  });

  it('ignores out-of-order fixes', () => {
    const trail = appendTrailPoint(EMPTY_TRAIL, { lat: 0, lng: 0, at: T }, 'automotive');
    expect(appendTrailPoint(trail, { lat: 1, lng: 1, at: T - 1 }, 'automotive')).toBe(trail);
  });
});
