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

  it('leaves out a place the model could give no taste tag', () => {
    const parsed = schema?.parse(reply({ tags: [] })) as { pois: unknown[] };
    expect(parsed.pois).toEqual([]);
  });

  it('sends back a note that compares the place with another on its list', () => {
    expect(schema?.safeParse(reply({ why_go: 'Another Bao Dai residence.' })).success).toBe(false);
    expect(schema?.safeParse(reply({ crowd_hint: 'Less crowded than Palace II' })).success).toBe(
      false,
    );
    expect(schema?.safeParse(reply({ crowd_hint: 'Quieter than other falls' })).success).toBe(
      false,
    );
    expect(schema?.safeParse(reply({ crowd_hint: 'Busier than usual at sunset' })).success).toBe(
      true,
    );
  });

  it('flags a superlative or a date for the reviewer, not a plain note', () => {
    const claim = placesKind.validators.items?.find((v) => v.id === 'unsupported-claim');
    const item = (why_go: string) => {
      const parsed = schema?.parse(reply({ why_go })) as {
        pois: Parameters<typeof toPoiItem>[1][];
      };
      const editorial = parsed.pois[0];
      if (editorial === undefined) throw new Error('no editorial');
      return toPoiItem(source, editorial);
    };
    const ctx = { items: [], previous: [] };
    expect(claim?.check(item("One of Portugal's largest viewpoints."), ctx)).toHaveLength(1);
    expect(claim?.check(item('A station from the 1930s.'), ctx)).toHaveLength(1);
    expect(claim?.check(item('A tiled terrace over the rooftops.'), ctx)).toEqual([]);
  });

  it('stores an empty open-data address as none', () => {
    const parsed = schema?.parse(reply({})) as { pois: Parameters<typeof toPoiItem>[1][] };
    const editorial = parsed.pois[0];
    if (editorial === undefined) throw new Error('no editorial');
    expect(toPoiItem(source, editorial).address).toBeNull();
  });
});

describe("a curated city beside its country's guide city", () => {
  const inside = placesKind.validators.items?.find((v) => v.id === 'inside-destination');
  const item = (destination: string, lat: number, lng: number) => {
    const parsed = placesKind
      .prompt?.({ id: 'x', input: [source] }, { units: [] })
      .schema.parse(reply({})) as { pois: Parameters<typeof toPoiItem>[1][] };
    const editorial = parsed.pois[0];
    if (editorial === undefined) throw new Error('no editorial');
    return toPoiItem({ ...source, destination, lat, lng, tz: 'Asia/Ho_Chi_Minh' }, editorial);
  };

  it('is checked against its own country, and an unknown destination fails', () => {
    const ctx = { items: [], previous: [] };
    expect(inside?.check(item('vn-da-lat', 11.9404, 108.4583), ctx)).toEqual([]);
    expect(inside?.check(item('vn-da-lat', 38.7118, -9.1302), ctx)).toHaveLength(1);
    expect(inside?.check(item('nowhere', 11.9404, 108.4583), ctx)).toHaveLength(1);
  });
});
