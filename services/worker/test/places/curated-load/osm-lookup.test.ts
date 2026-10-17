/**
 * The questions a curated place puts to Nominatim: its local name, then its English name (a
 * bracketed note left out), then the English name with the city, and a compound name's first part,
 * near the researcher's point; a day trip or nature area is asked again in a wider box and accepted
 * further from the point, a beach a little further. An activity is never asked about. A name
 * written the British way is asked the American way too, and a local name several lines share
 * (the street they stand on) stays only with the line that is a street or district.
 */
import type { NominatimResult } from '@cp/domain';
import type { NominatimQuery } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  curatedStopOnly,
  FAR_ACCEPT_RADIUS_M,
  farReaching,
  findCuratedOsmPlace,
} from '../../../src/places/curated-load/osm-lookup';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';
import { withoutSharedLocalNames } from '../../../src/places/curated-load/rows';
import { plainWords } from '../../../src/places/pick/match';
import { HANAMIKOJI_REPLY } from '../../../../../packages/planner/test/draft/nominatim-fixture';

const line = (over: Partial<CuratedPlaceRow>): CuratedPlaceRow => ({
  destination: 'th-pattaya',
  name_en: 'Pattaya Floating Market',
  name_local: 'ตลาดน้ำ 4 ภาค',
  category: 'market',
  subtype: 'floating market',
  lat: 12.8687,
  lng: 100.9046,
  why_go_en: 'Four regions of Thai food on the water.',
  why_go_vi: 'Món ăn bốn miền Thái trên mặt nước.',
  visit_minutes: 120,
  best_time: 'Mornings',
  busy: 'Tour buses from 10:00.',
  entry_fee: { text: '200 baht', source_url: null, estimate: true },
  hours: { text: '9:00-20:00', source_url: null, estimate: true },
  tips_en: ['Bring cash.'],
  tips_vi: ['Mang tiền mặt.'],
  getting_there: 'Taxi from the centre.',
  sources: ['https://example.org/market'],
  ...over,
});

const plain = plainWords('Pattaya', 'Thailand');

async function asked(
  row: CuratedPlaceRow,
  city: string | null = null,
): Promise<[string, number][]> {
  const queries: NominatimQuery[] = [];
  await findCuratedOsmPlace(
    row,
    plain,
    (query) => {
      queries.push(query);
      return Promise.resolve([]);
    },
    city,
  );
  return queries.map((q) => [q.q, Number(((q.box.maxLat - q.box.minLat) / 2).toFixed(2))]);
}

describe('asking Nominatim for a curated place', () => {
  it('asks the local name, the English name, then the English name with the city', async () => {
    expect(await asked(line({}))).toEqual([
      ['ตลาดน้ำ 4 ภาค', 0.2],
      ['Pattaya Floating Market', 0.2],
    ]);
    // The city is left out of a name that already carries it.
    expect(await asked(line({}), 'Pattaya')).toHaveLength(2);
    expect(
      await asked(line({ name_en: 'Bronte Beach and Baths', name_local: null }), 'Sydney'),
    ).toEqual([
      ['Bronte Beach and Baths', 0.2],
      ['Bronte Beach and Baths, Sydney', 0.2],
      ['Bronte Beach', 0.2],
    ]);
  });

  it('accepts a beach a stretch of coast from the point, by its first name part', async () => {
    const bronte: NominatimResult = {
      osm_type: 'way',
      osm_id: 4242,
      lat: '-33.9035',
      lon: '151.2680',
      category: 'natural',
      type: 'beach',
      name: 'Bronte Beach',
      namedetails: { name: 'Bronte Beach' },
    };
    // About 3.3 km from the researcher's point: past the city radius, inside the beach one.
    const row = line({
      name_en: 'Bronte Beach and Baths',
      name_local: null,
      category: 'beach',
      subtype: 'ocean pool',
      lat: -33.8735,
      lng: 151.268,
    });
    const found = await findCuratedOsmPlace(
      row,
      plainWords('Sydney', 'Australia'),
      (query) => Promise.resolve(query.q === 'Bronte Beach' ? [bronte] : []),
      'Sydney',
    );
    expect(found.place).toMatchObject({ sourceId: 'w4242', name: 'Bronte Beach' });
    expect(found.queries).toBe(3);
  });

  it('widens once for a day trip and leaves a bracketed note out of the question', async () => {
    const trip = line({
      name_en: 'Koh Larn (Coral Island)',
      name_local: 'เกาะล้าน',
      category: 'beach',
      subtype: 'island day trip',
    });
    expect(farReaching(trip)).toBe(true);
    expect(FAR_ACCEPT_RADIUS_M).toBeGreaterThan(2_000);
    expect(await asked(trip)).toEqual([
      ['เกาะล้าน', 0.2],
      ['Koh Larn', 0.2],
      ['เกาะล้าน', 1],
      ['Koh Larn', 1],
    ]);
    expect(farReaching(line({ why_go_en: 'A half-day trip from town.' }))).toBe(true);
    expect(farReaching(line({ category: 'nature' }))).toBe(true);
    expect(farReaching(line({}))).toBe(false);
  });

  it('keeps activities as curated-only stops and still asks about venues', () => {
    const stop = (name_en: string, subtype: string | null = null) =>
      curatedStopOnly(line({ name_en, subtype, category: 'other' }));
    expect(stop('Sunset Catamaran Cruise')).toBe(true);
    expect(stop('Fira to Oia Hike')).toBe(true);
    expect(stop('Hoai River Lantern Boat', 'lantern boat ride')).toBe(true);
    expect(stop('Hoi An Memories Show')).toBe(true);
    expect(stop('Tablao Las Tablas', 'flamenco show')).toBe(false);
    expect(stop('Moulin Rouge', 'cabaret show')).toBe(false);
    expect(stop('Thang Long Water Puppet Theatre', 'water puppet show')).toBe(false);
    expect(stop('Donaukanal', 'canal promenade')).toBe(false);
    expect(stop('Lycian Way Ölüdeniz to Faralya', 'coastal hiking trail')).toBe(false);
  });

  it('asks a British spelling the American way too', async () => {
    const maxwell = line({
      destination: 'sg-singapore',
      name_en: 'Maxwell Food Centre',
      name_local: null,
      category: 'food',
      subtype: 'hawker centre',
      lat: 1.2803,
      lng: 103.8445,
    });
    expect((await asked(maxwell, 'Singapore')).map(([q]) => q)).toEqual([
      'Maxwell Food Centre',
      'Maxwell Food Centre, Singapore',
      'Maxwell Food Center',
    ]);
  });

  it('keeps a local name several places share only for the street, never for a bar on it', async () => {
    const gion = (name_en: string, category: CuratedPlaceRow['category'], subtype: string) =>
      line({
        destination: 'kyoto',
        name_en,
        name_local: '花見小路',
        category,
        subtype,
        lat: 35.0046,
        lng: 135.7737,
      });
    const lines = withoutSharedLocalNames([
      gion('Gion Hanamikoji', 'other', 'historic geisha district'),
      gion('Kamo River', 'nature', 'riverside promenade'),
      gion('Gion Finlandia Bar', 'nightlife', 'bar in a former geisha house'),
      gion('Yasukawa', 'food', 'local izakaya'),
    ]);
    expect(lines.map((l) => l.name_local ?? null)).toEqual(['花見小路', null, null, null]);
    // Asked by its English name only, the izakaya is not the restaurant called 花見小路.
    const yasukawa = lines[3]!;
    const found = await findCuratedOsmPlace(
      yasukawa,
      plainWords('Kyoto', 'Japan'),
      (query) => Promise.resolve(query.q === '花見小路' ? HANAMIKOJI_REPLY : []),
      'Kyoto',
    );
    expect(found.place).toBeNull();
    // With the shared local name it would have been.
    const before = await findCuratedOsmPlace(
      gion('Yasukawa', 'food', 'local izakaya'),
      plainWords('Kyoto', 'Japan'),
      (query) => Promise.resolve(query.q === '花見小路' ? HANAMIKOJI_REPLY : []),
      'Kyoto',
    );
    expect(before.place?.sourceId).toBe('n4886634238');
    // A line alone keeps its local name.
    expect(
      withoutSharedLocalNames([gion('Yasukawa', 'food', 'local izakaya')])[0]?.name_local,
    ).toBe('花見小路');
  });
});
