/**
 * What lifts a place up the candidate lists: how well the researchers found it known (its standing
 * and the itinerary pages holding it), and the crew's tastes, matched by kind or by a taste tag the
 * place carries itself.
 */
import { describe, expect, it } from 'vitest';

import { candidatePools, type DraftPoi } from '../../src/draft/index';
import { fameScore, tasteScore } from '../../src/draft/place-score';
import { FRAME, id } from './da-nang-fixture';

const sight = (n: number, extra: Partial<DraftPoi> = {}): DraftPoi => ({
  id: id(n),
  name: `Sight ${n}`,
  category: 'other',
  // Spread over the city, a few hundred metres apart.
  lat: 16.05 + (n % 7) * 0.004,
  lng: 108.2 + Math.floor(n / 7) * 0.004,
  tz: 'Asia/Ho_Chi_Minh',
  hours: null,
  priceLevel: null,
  tags: [],
  durationMin: 90,
  editorial: true,
  mustSee: false,
  detail: 5,
  ...extra,
});

describe('how well known a place is', () => {
  it('scores an icon over a popular place over a local favourite, and pages read up to a cap', () => {
    expect(fameScore(sight(1, { prominence: 'icon' }))).toBeGreaterThan(
      fameScore(sight(2, { prominence: 'popular' })),
    );
    expect(fameScore(sight(3, { prominence: 'local_favourite' }))).toBeGreaterThan(
      fameScore(sight(4)),
    );
    expect(fameScore(sight(5, { blogCount: 3 }))).toBeGreaterThan(
      fameScore(sight(6, { blogCount: 1 })),
    );
    expect(fameScore(sight(7, { blogCount: 12 }))).toBe(fameScore(sight(8, { blogCount: 4 })));
  });

  it('takes a well-known place onto a full activities list ahead of plain ones', () => {
    const plain = Array.from({ length: 60 }, (_, i) => sight(200 + i));
    const famous = sight(300, { prominence: 'icon', blogCount: 5 });
    const pools = candidatePools({ pois: [...plain, famous], frame: FRAME, tastes: {} });
    expect(pools.activities.length).toBeLessThan(plain.length);
    expect(pools.activities.map((poi) => poi.id)).toContain(famous.id);
  });
});

describe('a crew’s tastes', () => {
  it('match a taste tag the place carries even where no kind of place stands for it', () => {
    const viewpoint = sight(10, { tags: ['photo_spots'] });
    const bistro = sight(11, { tags: ['sit_down_dining'] });
    expect(tasteScore(viewpoint, { photo_spots: 2 })).toBe(2);
    expect(tasteScore(bistro, { sit_down_dining: 1 })).toBe(1);
    expect(tasteScore(sight(12), { photo_spots: 2 })).toBe(0);
  });

  it('still match by kind', () => {
    expect(tasteScore(sight(13, { category: 'museum' }), { museums: 1, history: 1 })).toBe(2);
  });
});
