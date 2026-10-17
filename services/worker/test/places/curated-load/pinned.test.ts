/**
 * A curated line's own OpenStreetMap element: the id is written `node/<id>`, `way/<id>` or
 * `relation/<id>` and read as the ingest's `source_ids.osm` key; a looked-up element is the place
 * whatever its name, with OSM's name, address and kind, unless it lies too far from the line's
 * point; one without a name of its own takes the line's names.
 */
import type { NominatimResult } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { osmSourceId, PINNED_RADIUS_M, pinnedPlace } from '../../../src/places/curated-load/pinned';
import { curatedPlaceRowSchema, type CuratedPlaceRow } from '../../../src/places/curated-load/rows';
import { PATONG_BEACH_REPLY } from '../../../../../packages/planner/test/draft/nominatim-fixture';

const row: CuratedPlaceRow = {
  destination: 'th-phuket',
  name_en: 'Sky Deck Rooftop',
  name_local: 'สกายเด็ค',
  category: 'nightlife',
  lat: 7.8961,
  lng: 98.2963,
  why_go_en: 'Sunset over the bay.',
  why_go_vi: 'Hoàng hôn trên vịnh.',
  visit_minutes: 90,
  best_time: 'Sunset',
  busy: 'Busy from 18:00.',
  entry_fee: { text: 'Free', source_url: null, estimate: true },
  hours: { text: '17:00-1:00', source_url: null, estimate: true },
  tips_en: ['Book a table.'],
  tips_vi: ['Đặt bàn trước.'],
  getting_there: 'Walk from Bangla Road.',
  sources: ['https://example.org/sky-deck'],
};
const lead = {
  name: row.name_en,
  localName: null,
  category: row.category,
  lat: row.lat,
  lng: row.lng,
};
const hotel = PATONG_BEACH_REPLY[1]!;

describe('a curated line pinned to its OpenStreetMap element', () => {
  it('accepts only an element id and reads it as the ingest writes it', () => {
    expect(curatedPlaceRowSchema.safeParse({ ...row, osm: 'way/42' }).success).toBe(true);
    for (const osm of ['w42', 'way/0', 'area/42', 'node/12a', 'https://osm.org/node/1']) {
      expect(curatedPlaceRowSchema.safeParse({ ...row, osm }).success).toBe(false);
    }
    expect(['node/7', 'way/42', 'relation/9'].map(osmSourceId)).toEqual(['n7', 'w42', 'r9']);
    expect(osmSourceId('way/x')).toBeNull();
  });

  it("takes the element's own name, address and kind whatever the line calls it", () => {
    expect(pinnedPlace(row, hotel, lead)).toMatchObject({
      sourceId: 'n4412345678',
      name: 'Patong Beach Hotel',
      nameLocal: null,
      category: 'stay',
      address: '124 Thawewong Road, Patong, Kathu District',
      website: 'https://patongbeachhotel.example',
    });
  });

  it("gives an element without a name the line's names", () => {
    const unnamed: NominatimResult = { ...hotel, name: null, namedetails: null };
    expect(pinnedPlace(row, unnamed, lead)).toMatchObject({
      name: 'Sky Deck Rooftop',
      nameLocal: 'สกายเด็ค',
    });
  });

  it('refuses an element beyond the guard distance or without a point', () => {
    const far: NominatimResult = { ...hotel, lat: String(row.lat + PINNED_RADIUS_M / 100_000) };
    expect(pinnedPlace(row, far, lead)).toBeNull();
    expect(pinnedPlace(row, { ...hotel, lat: 'x' }, lead)).toBeNull();
  });
});
