/**
 * Accepting a Nominatim result: it is the place only when one of its names passes the curated
 * name rules and it lies near the lead's point when a radius is given; the place takes OSM's
 * name, local name, point, address and mapped category.
 *
 * The replies (`./nominatim-fixture.ts`) follow Nominatim's documented jsonv2 format.
 */
import type { NominatimBox } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  acceptResult,
  addressFromParts,
  findOsmPlace,
  plainWords,
  type CuratedLead,
} from '../../src/draft';
import { CLARKE_QUAY_REPLY, HOOVER_DAM_REPLY, PATONG_BEACH_REPLY } from './nominatim-fixture';

const [beach, hotel] = PATONG_BEACH_REPLY;
const [dam] = HOOVER_DAM_REPLY;
const phuket = plainWords('Phuket', 'Thailand');
const vegas = plainWords('Las Vegas', 'United States');

const patong: CuratedLead = {
  name: 'Patong Beach',
  localName: 'หาดป่าตอง',
  category: 'beach',
  lat: 7.8961,
  lng: 98.2963,
};

describe('accepting a Nominatim result', () => {
  it('takes the beach with OSM name, local name, point, address and mapped category', () => {
    const found = acceptResult(patong, beach!, phuket, 2_000);
    expect(found?.place).toMatchObject({
      sourceId: 'w151234567',
      name: 'Patong Beach',
      nameLocal: 'หาดป่าตอง',
      category: 'beach',
      lat: 7.8935,
      lng: 98.2955,
      address: 'Thawewong Road, Patong, Kathu District',
    });
    expect(found!.place.distanceM).toBeLessThan(400);
  });

  it('turns down a hotel named after the beach and a namesake out of range', () => {
    expect(acceptResult(patong, hotel!, phuket, 2_000)).toBeNull();
    const north = { ...patong, lat: 7.9205 };
    expect(acceptResult(north, beach!, phuket, 2_000)).toBeNull();
    expect(acceptResult(north, beach!, phuket, 10_000)?.place.sourceId).toBe('w151234567');
    expect(acceptResult(north, beach!, phuket, null)?.place.sourceId).toBe('w151234567');
  });

  it('accepts by an alternative name and falls back to the lead kind when OSM has none', () => {
    const lead: CuratedLead = {
      name: 'Boulder Dam',
      localName: null,
      category: 'other',
      lat: 36.016,
      lng: -114.7377,
    };
    expect(acceptResult(lead, dam!, vegas, 2_000)?.place).toMatchObject({
      sourceId: 'w39876543',
      name: 'Hoover Dam',
      nameLocal: null,
      category: 'other',
      address: 'Hoover Dam Access Road, Boulder City',
      openingHours: 'Mo-Su 09:00-17:00',
    });
    expect(acceptResult({ ...lead, name: 'Lake Mead Marina' }, dam!, vegas, 2_000)).toBeNull();
  });

  it('takes a quay as its neighbourhood or walk, never the stop or station named after it', () => {
    const singapore = plainWords('Singapore', 'Singapore');
    const clarke: CuratedLead = {
      name: 'Clarke Quay',
      localName: null,
      category: 'nightlife',
      lat: 1.2906,
      lng: 103.8465,
      subtype: 'riverside dining',
    };
    const [stop, station, neighbourhood, walk] = CLARKE_QUAY_REPLY;
    expect(acceptResult(clarke, stop!, singapore, 2_000)).toBeNull();
    expect(acceptResult(clarke, station!, singapore, 2_000)).toBeNull();
    expect(acceptResult(clarke, neighbourhood!, singapore, 2_000)?.place).toMatchObject({
      sourceId: 'n2601316092',
      name: 'Clarke Quay',
      category: 'nightlife',
    });
    expect(acceptResult(clarke, walk!, singapore, 2_000)?.place.sourceId).toBe('w149965088');
    // A stop is no place of any kind it is named after.
    const eatery = { ...clarke, category: 'food' as const, subtype: 'riverside restaurant' };
    expect(acceptResult(eatery, stop!, singapore, 2_000)).toBeNull();
  });

  it('composes an address only from the parts it has', () => {
    expect(addressFromParts({ suburb: 'Patong', town: 'Patong' })).toBe('Patong');
    expect(addressFromParts({ country: 'Thailand' })).toBeNull();
    expect(addressFromParts(null)).toBeNull();
  });
});

describe('finding a place across queries', () => {
  const box: NominatimBox = { minLat: 7.6961, minLng: 98.0963, maxLat: 8.0961, maxLng: 98.4963 };

  it('stops at the first accepted answer and reports the nearest turned-down one', async () => {
    let asked = 0;
    const found = await findOsmPlace(
      patong,
      [
        { q: 'Patong Beach', box },
        { q: 'หาดป่าตอง', box },
      ],
      phuket,
      2_000,
      () => {
        asked += 1;
        return Promise.resolve(PATONG_BEACH_REPLY);
      },
    );
    expect(found).toMatchObject({ queries: 1, place: { sourceId: 'w151234567' } });
    expect(asked).toBe(1);
    const missed = await findOsmPlace(
      { ...patong, name: 'Freedom Beach', localName: null },
      [{ q: 'Freedom Beach', box }],
      phuket,
      2_000,
      () => Promise.resolve([hotel!]),
    );
    expect(missed).toMatchObject({ place: null, queries: 1 });
    expect(missed.nearestRejected?.name).toBe('Patong Beach Hotel');
  });

  it('stops without a place when the search may not ask now', async () => {
    const limited = await findOsmPlace(patong, [{ q: 'Patong Beach', box }], phuket, null, () =>
      Promise.resolve(null),
    );
    expect(limited).toEqual({ place: null, queries: 0, nearestRejected: null });
  });
});
