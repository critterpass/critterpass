/**
 * Search rows: one row per place, and a second line that tells same-named places apart (kind,
 * area, distance) or says where the place already stands on the trip.
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { searchPlacesOf } from '../data/fetch-search-places';
import { areaOf, onePerPlace, rowWords, type RowContext, type SearchPlace } from '../search-rows';

const row = (n: number, over: Partial<SearchPlace> = {}): SearchPlace => ({
  id: `0199a3f0-0000-7000-8000-0000000000${String(10 + n)}`,
  poiId: `0199a3f0-0000-7000-8000-0000000000${String(10 + n)}`,
  name: 'Tanah Lot',
  nameLocal: null,
  category: 'temple_shrine',
  lat: -8.6212,
  lng: 115.0868,
  tags: [],
  source: 'server',
  ...over,
});

const context: RowContext = {
  destination: 'Bali',
  from: { lat: -8.5069, lng: 115.2625 },
  addresses: new Map(),
  planDays: new Map(),
};

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('one row per place', () => {
  it('drops a second record of the same place a few steps away, and a repeated id', () => {
    const first = row(1);
    const rows = onePerPlace([
      first,
      first,
      row(2, { name: 'TANAH LOT', lat: -8.6213, lng: 115.0869 }),
      row(3, { name: 'Tanah Lot', lat: -8.65, lng: 115.13 }),
      row(4, { name: 'DFC Tanah Lot' }),
    ]);
    expect(rows.map((entry) => entry.id)).toEqual([first.id, row(3).id, row(4).id]);
  });

  it('keeps same-named rows whose spot is unknown', () => {
    expect(onePerPlace([row(1), row(2, { lat: null, lng: null })])).toHaveLength(2);
  });
});

describe('a row’s second line', () => {
  it('says the kind, the area and how far', () => {
    expect(rowWords(row(1, { area: 'Beraban' }), context).meta).toBe('Temples · Beraban · 23 km');
  });

  it('uses the server’s distance, and reads the area from an address on the phone', () => {
    const place = row(1, { source: 'curated', distanceM: 420 });
    const addresses = new Map([[place.id, 'Jl. Raya Tanah Lot, Beraban, Tabanan Regency, Bali']]);
    expect(rowWords(place, { ...context, addresses }).meta).toBe('Temples · Beraban · 400 m');
  });

  it('marks a place already on a day and takes its + away', () => {
    const place = row(1);
    const words = rowWords(place, { ...context, planDays: new Map([[place.id, 'Wed']]) });
    expect(words).toEqual({ meta: 'In the plan · Wed', inPlan: true });
  });

  it('leaves out what is not known', () => {
    const place = row(1, { category: 'other', lat: null, lng: null });
    expect(rowWords(place, context).meta).toBeUndefined();
    expect(rowWords({ ...place, source: 'idea' }, context).meta).toBe('In your Ideas');
  });
});

describe('the area in an address', () => {
  it('skips streets, numbers, provinces and the destination itself', () => {
    expect(areaOf('Jalan Hanoman 10, Ubud, Gianyar Regency, Bali 80571', 'Bali')).toBe('Ubud');
    expect(areaOf('Bali', 'Bali')).toBeNull();
    expect(areaOf(null, 'Bali')).toBeNull();
  });
});

describe('the server’s places', () => {
  it('keeps the server’s order and what it knows about each place', () => {
    const rows = searchPlacesOf({
      results: [
        {
          id: 'b',
          name: 'Tanah Lot',
          category: 'temple_shrine',
          area: 'Beraban',
          recommended: true,
        },
        { id: 'a', name: 'Tanah Lot', category: 'stay', lat: 1, lng: 2, distanceM: 90 },
        { name: 'no id' },
      ],
    });
    expect(rows.map((entry) => [entry.id, entry.area ?? null, entry.recommended])).toEqual([
      ['b', 'Beraban', true],
      ['a', null, false],
    ]);
    expect(rows[1]?.distanceM).toBe(90);
  });
});
