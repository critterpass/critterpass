/**
 * The drafting estimate of a ride: routed minutes where the routing service gave them, else a
 * walk or a ride fitted on routed legs, with no jump where a city ride turns into a long one, and
 * a place whose routed legs all run slow (a summit road) carrying its own extra minutes.
 */
import { describe, expect, it } from 'vitest';

import { estimatedMinutes, routedPairKey, straightLineMatrix } from '../../src/draft/index';
import { id, place } from './day-sense-fixture';

describe('the drafting estimate of a ride', () => {
  it('never gets shorter as a ride grows, and has no jump at the city edge', () => {
    // Short hops are walked, as the day screen shows them (a walk of a quarter hour or less).
    expect(estimatedMinutes(500)).toBeLessThanOrEqual(10);
    let last = 0;
    for (let metres = 900; metres <= 40_000; metres += 100) {
      const minutes = estimatedMinutes(metres);
      expect(minutes).toBeGreaterThanOrEqual(last);
      // A kilometre more is never more than a few minutes more, at any distance.
      if (metres > 900) expect(minutes - last).toBeLessThanOrEqual(1);
      last = minutes;
    }
    // Close to the routed legs: a 3 km ride about 9 minutes, 21 km about 45.
    expect(estimatedMinutes(3000)).toBeGreaterThanOrEqual(8);
    expect(estimatedMinutes(3000)).toBeLessThanOrEqual(11);
    expect(estimatedMinutes(21_000)).toBeGreaterThanOrEqual(40);
    expect(estimatedMinutes(21_000)).toBeLessThanOrEqual(48);
  });

  it('takes routed minutes where it has them, and a slow place carries its extra minutes', () => {
    // A summit 12 km north of town, and three places in town around it.
    const summit = place(1, 'Summit', 'nature', { lat: 12.05, lng: 108.44 });
    const town = [2, 3, 4].map((n) =>
      place(n, `Town ${n}`, 'food', { lat: 11.94 + n * 0.001, lng: 108.44 }),
    );
    const pois = new Map([summit, ...town].map((p) => [p.id, p]));
    const routed = new Map([
      [routedPairKey(id(1), id(2)), 60],
      [routedPairKey(id(1), id(3)), 62],
    ]);
    const travel = straightLineMatrix(pois, routed);
    expect(travel(id(2), id(1))).toBe(60);
    // Never routed, yet as slow as the summit's routed legs.
    expect(travel(id(1), id(4))).toBeGreaterThanOrEqual(55);
    // Without them, the plain estimate.
    expect(straightLineMatrix(pois)(id(1), id(4))).toBeLessThan(35);
  });
});
