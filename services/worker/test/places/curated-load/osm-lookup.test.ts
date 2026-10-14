/**
 * The questions a curated place puts to Nominatim: its English name (a bracketed note left out),
 * then its local name, near the researcher's point; a day trip or nature area is asked again in a
 * wider box and accepted further from the point.
 */
import type { NominatimQuery } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  FAR_ACCEPT_RADIUS_M,
  farReaching,
  findCuratedOsmPlace,
} from '../../../src/places/curated-load/osm-lookup';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';
import { plainWords } from '../../../src/places/pick/match';

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

async function asked(row: CuratedPlaceRow): Promise<[string, number][]> {
  const queries: NominatimQuery[] = [];
  await findCuratedOsmPlace(row, plain, (query) => {
    queries.push(query);
    return Promise.resolve([]);
  });
  return queries.map((q) => [q.q, Number(((q.box.maxLat - q.box.minLat) / 2).toFixed(2))]);
}

describe('asking Nominatim for a curated place', () => {
  it('asks the English name, then the local name, near the point', async () => {
    expect(await asked(line({}))).toEqual([
      ['Pattaya Floating Market', 0.2],
      ['ตลาดน้ำ 4 ภาค', 0.2],
    ]);
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
      ['Koh Larn', 0.2],
      ['เกาะล้าน', 0.2],
      ['Koh Larn', 1],
      ['เกาะล้าน', 1],
    ]);
    expect(farReaching(line({ why_go_en: 'A half-day trip from town.' }))).toBe(true);
    expect(farReaching(line({ category: 'nature' }))).toBe(true);
    expect(farReaching(line({}))).toBe(false);
  });
});
