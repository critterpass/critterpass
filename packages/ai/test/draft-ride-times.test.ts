/**
 * The drafting estimate against the legs the routing service computed on staging after real
 * drafts, in Đà Nẵng and Đà Lạt: for a pair it never routed (each routed pair left out in turn),
 * the estimate is within a quarter of the routed minutes (or two minutes) for most pairs.
 */
import { routedPairKey, straightLineMatrix, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CITIES } from '../evals/draft/cases';

describe('ride times while drafting', { timeout: 60_000 }, () => {
  it.each(['da-nang-v6', 'da-lat-curated'] as const)('agree with the routed legs in %s', (name) => {
    const city = CITIES[name];
    if (city === undefined) throw new Error(`no city ${name}`);
    // Only what the estimate reads: where each place is.
    const pois = new Map(
      city.pois.map((p): [string, DraftPoi] => [
        p.id,
        {
          id: p.id,
          name: p.name,
          category: p.category,
          lat: p.lat,
          lng: p.lng,
          tz: city.tz,
          hours: null,
          priceLevel: p.price_level,
          tags: p.tags,
          durationMin: p.duration_min,
          editorial: p.editorial,
          mustSee: p.must_see,
        },
      ]),
    );
    let close = 0;
    for (const [a, b, routed] of city.routed) {
      const rest = new Map(
        city.routed
          .filter(([x, y]) => !(x === a && y === b))
          .map(([x, y, m]): [string, number] => [routedPairKey(x, y), m]),
      );
      const estimate = straightLineMatrix(pois, rest)(a, b) ?? Number.POSITIVE_INFINITY;
      if (Math.abs(estimate - routed) <= Math.max(0.25 * routed, 2)) close += 1;
    }
    expect(city.routed.length).toBeGreaterThan(100);
    expect(close / city.routed.length).toBeGreaterThanOrEqual(0.8);
  });
});
