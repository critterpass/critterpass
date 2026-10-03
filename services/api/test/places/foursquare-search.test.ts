/**
 * Place Search mapping against a recorded response (Bali waterfalls, recorded 2026-10-03), and the
 * same-place pick a live result is resolved with.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { mapFoursquareSearch } from '../../src/places/foursquare-search';
import { pickSamePlace } from '../../src/places/live-resolve';

const recorded: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/foursquare-place-search.json', import.meta.url), 'utf8'),
);

describe('mapFoursquareSearch', () => {
  it('maps a recorded Place Search response onto our categories', () => {
    const places = mapFoursquareSearch(recorded);
    expect(places).toHaveLength(3);
    expect(places[0]).toEqual({
      fsqPlaceId: '5688c451498e3181bd093eeb',
      name: 'Tukad Cepung Waterfall',
      category: 'nature',
      lat: -8.44097782657731,
      lng: 115.38770884699558,
      address: 'Undisan, Bali',
      distanceM: 15590,
    });
  });

  it('drops malformed results instead of failing the whole answer', () => {
    expect(
      mapFoursquareSearch({
        results: [
          { name: 'no id', latitude: 1, longitude: 1 },
          {
            fsq_place_id: 'a1',
            name: 'Kept',
            latitude: 1,
            longitude: 2,
            location: { formatted_address: ' ' },
          },
        ],
      }),
    ).toEqual([
      {
        fsqPlaceId: 'a1',
        name: 'Kept',
        category: 'other',
        lat: 1,
        lng: 2,
        address: null,
        distanceM: null,
      },
    ]);
    expect(mapFoursquareSearch({ message: 'Unauthorized' })).toEqual([]);
  });
});

describe('pickSamePlace', () => {
  const candidates = [
    { id: 'far', name: 'Tegenungan Waterfall', name_local: null, distance_m: 120 },
    {
      id: 'near',
      name: 'Air Terjun Tegenungan',
      name_local: 'Tegenungan Waterfall',
      distance_m: 30,
    },
    { id: 'other', name: 'Warung Tegal', name_local: null, distance_m: 5 },
  ];

  it('takes the same-named place, the nearer one on a tie', () => {
    expect(pickSamePlace('Tegenungan Waterfall', candidates)?.id).toBe('near');
  });

  it('finds nothing when no name is close enough', () => {
    expect(pickSamePlace('Monkey Forest', candidates)).toBeNull();
  });
});
