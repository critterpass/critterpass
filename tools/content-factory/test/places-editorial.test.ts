import { describe, expect, it } from 'vitest';

import { placesKind, toPoiItem, type PoiSource } from '../src/kinds/places/pois';

const source: PoiSource = {
  ref: 'overture:fixture-lx-1',
  destination: 'lisbon',
  code: 'pt',
  name: 'Miradouro de Santa Luzia',
  nameLocal: null,
  category: 'nature',
  lat: 38.7118,
  lng: -9.1302,
  address: '',
  tz: 'Europe/Lisbon',
  hours: null,
  duplicate: null,
};

const reply = (overrides: Record<string, unknown>) => ({
  pois: [
    {
      ref: source.ref,
      why_go: 'A tiled terrace over the Alfama rooftops and the river.',
      best_time: 'Late afternoon',
      time_needed_min: 30,
      crowd_hint: 'Busy at sunset',
      etiquette: null,
      tags: ['photo_spots'],
      ...overrides,
    },
  ],
});

describe('POI editorial replies', () => {
  const schema = placesKind.prompt?.({ id: 'lisbon-001', input: [source] }, { units: [] }).schema;

  it('clamps an overshooting reply instead of rejecting the unit', () => {
    const parsed = schema?.parse(
      reply({
        time_needed_min: 5,
        tags: ['photo_spots', 'culture', 'history', 'local_life', 'easy_pace'],
      }),
    ) as { pois: { time_needed_min: number; tags: string[] }[] };
    expect(parsed.pois[0]?.time_needed_min).toBe(10);
    expect(parsed.pois[0]?.tags).toEqual(['photo_spots', 'culture', 'history', 'local_life']);
  });

  it('stores an empty open-data address as none', () => {
    const parsed = schema?.parse(reply({})) as { pois: Parameters<typeof toPoiItem>[1][] };
    const editorial = parsed.pois[0];
    if (editorial === undefined) throw new Error('no editorial');
    expect(toPoiItem(source, editorial).address).toBeNull();
  });
});
