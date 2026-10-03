/**
 * The OSM side of place ingest without the network: picking the Geofabrik extract for a
 * destination's bounds from a recorded slice of Geofabrik's index (2026-10-03), and mapping one
 * joined OSM element into a place row.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseGeofabrikIndex, pickRegion } from '../../src/places/osm-extract';
import { toOsmPlaceRow } from '../../src/places/osm-reader';

const regions = parseGeofabrikIndex(
  JSON.parse(readFileSync(new URL('./fixtures/geofabrik-index.json', import.meta.url), 'utf8')),
);

const BALI = { minLat: -8.9, maxLat: -8.05, minLng: 114.4, maxLng: 115.75 };

describe('pickRegion', () => {
  it('takes the smallest extract holding the whole box', () => {
    expect(pickRegion(regions, BALI)?.id).toBe('nusa-tenggara');
    expect(
      pickRegion(regions, { minLat: 34.85, maxLat: 35.15, minLng: 135.6, maxLng: 135.9 })?.id,
    ).toBe('kansai');
    expect(
      pickRegion(regions, { minLat: 15.84, maxLat: 16.21, minLng: 107.95, maxLng: 108.36 })?.id,
    ).toBe('vietnam');
  });

  it('finds nothing for a box no extract covers', () => {
    expect(
      pickRegion(regions, { minLat: 38.6, maxLat: 38.85, minLng: -9.55, maxLng: -9.0 }),
    ).toBeNull();
  });
});

describe('toOsmPlaceRow', () => {
  const element = (
    tags: Record<string, string>,
    extra: Partial<{ kind: string; lat: unknown; lon: unknown }> = {},
  ) => ({
    kind: 'way',
    id: 123,
    tags: JSON.stringify(tags),
    lat: -8.5185,
    lon: 115.2608,
    ...extra,
  });

  it('keeps the English name and the local one, hours, contact and address', () => {
    expect(
      toOsmPlaceRow(
        element({
          tourism: 'attraction',
          name: 'Pura Taman Saraswati',
          'name:en': 'Saraswati Temple',
          opening_hours: 'Mo-Su 08:00-18:00',
          'contact:website': 'https://example.org',
          'addr:street': 'Jalan Kajeng',
          'addr:city': 'Ubud',
          wikidata: 'Q7261320',
        }),
        BALI,
      ),
    ).toEqual({
      sourceId: 'w123',
      name: 'Saraswati Temple',
      nameLocal: 'Pura Taman Saraswati',
      classification: { category: 'other', kind: 'place' },
      lat: -8.5185,
      lng: 115.2608,
      address: 'Jalan Kajeng, Ubud',
      openingHours: 'Mo-Su 08:00-18:00',
      website: 'https://example.org',
      phone: undefined,
      wikidata: 'Q7261320',
    });
  });

  it('drops elements outside the box, without a point, or not read', () => {
    expect(
      toOsmPlaceRow(element({ natural: 'peak', name: 'Agung' }, { lat: -7.0 }), BALI),
    ).toBeNull();
    expect(
      toOsmPlaceRow(element({ natural: 'peak', name: 'Agung' }, { lat: null, lon: null }), BALI),
    ).toBeNull();
    expect(toOsmPlaceRow(element({ highway: 'bus_stop', name: 'Halte' }), BALI)).toBeNull();
  });
});
