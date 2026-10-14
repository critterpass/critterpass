/**
 * Looking a curated place up in OpenStreetMap: a result is the place only when one of its names
 * passes the loader's name rules and it lies near the researcher's point (further for a day trip
 * or nature area); the row takes OSM's name, local name, point, address and mapped category. The
 * search keeps Nominatim's usage policy: one request a second, a contact User-Agent, no repeats.
 *
 * The replies in `fixtures/nominatim/` follow Nominatim's documented `format=jsonv2` search reply
 * (with `addressdetails`, `namedetails` and `extratags`); they were written from that format, not
 * recorded, as this machine cannot reach nominatim.openstreetmap.org. Element ids are illustrative.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { CuratedLead } from '../../../src/places/curated-load/match';
import {
  acceptResult,
  ACCEPT_RADIUS_M,
  addressFromParts,
  createNominatimSearch,
  farReaching,
  findOsmPlace,
  MIN_REQUEST_INTERVAL_MS,
  NOMINATIM_USER_AGENT,
  type NominatimQuery,
  type NominatimResult,
} from '../../../src/places/curated-load/osm-lookup';
import type { CuratedPlaceRow } from '../../../src/places/curated-load/rows';
import { plainWords } from '../../../src/places/pick/match';

const reply = (name: string): NominatimResult[] =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/nominatim/${name}.json`, import.meta.url), 'utf8'),
  ) as NominatimResult[];

const [beach, hotel] = reply('patong-beach');
const [dam] = reply('hoover-dam');
const phuket = plainWords('Phuket', 'Thailand');

const patong: CuratedLead = {
  name: 'Patong Beach',
  localName: 'หาดป่าตอง',
  category: 'beach',
  lat: 7.8961,
  lng: 98.2963,
};

const line = (over: Partial<CuratedPlaceRow>): CuratedPlaceRow => ({
  destination: 'th-phuket',
  name_en: 'Patong Beach',
  name_local: 'หาดป่าตอง',
  category: 'beach',
  subtype: 'resort beach',
  lat: 7.8961,
  lng: 98.2963,
  why_go_en: 'The busiest beach on the island.',
  why_go_vi: 'Bãi biển đông nhất đảo.',
  visit_minutes: 180,
  best_time: 'Mornings',
  busy: 'Busy from noon.',
  entry_fee: { text: 'Free', source_url: null, estimate: true },
  hours: { text: 'Always open', source_url: null, estimate: true },
  tips_en: ['Bring shade.'],
  tips_vi: ['Mang ô che.'],
  getting_there: 'Songthaew from Phuket Town.',
  sources: ['https://example.org/patong'],
  ...over,
});

describe('accepting a Nominatim result', () => {
  it('takes the beach with OSM name, local name, point, address and mapped category', () => {
    const found = acceptResult(patong, beach!, phuket, ACCEPT_RADIUS_M);
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
    expect(acceptResult(patong, hotel!, phuket, ACCEPT_RADIUS_M)).toBeNull();
    const north = { ...patong, lat: 7.9205 };
    expect(acceptResult(north, beach!, phuket, ACCEPT_RADIUS_M)).toBeNull();
    expect(acceptResult(north, beach!, phuket, 10_000)?.place.sourceId).toBe('w151234567');
  });

  it('accepts by an alternative name and falls back to the curated kind when OSM has none', () => {
    const lead: CuratedLead = {
      name: 'Boulder Dam',
      localName: null,
      category: 'other',
      lat: 36.016,
      lng: -114.7377,
    };
    const found = acceptResult(lead, dam!, plainWords('Las Vegas', 'United States'), 2_000);
    expect(found?.place).toMatchObject({
      sourceId: 'w39876543',
      name: 'Hoover Dam',
      nameLocal: null,
      category: 'other',
      address: 'Hoover Dam Access Road, Boulder City',
      openingHours: 'Mo-Su 09:00-17:00',
    });
    const other = { ...lead, name: 'Lake Mead Marina' };
    expect(acceptResult(other, dam!, plainWords('Las Vegas', 'United States'), 2_000)).toBeNull();
  });

  it('composes an address only from the parts it has', () => {
    expect(addressFromParts({ suburb: 'Patong', town: 'Patong' })).toBe('Patong');
    expect(addressFromParts({ country: 'Thailand' })).toBeNull();
    expect(addressFromParts(null)).toBeNull();
  });
});

describe('looking a curated place up', () => {
  it('asks the English name, then the local name, and widens only for a day trip', async () => {
    const asked: NominatimQuery[] = [];
    const search = (query: NominatimQuery) => {
      asked.push(query);
      return Promise.resolve([]);
    };
    const plain = await findOsmPlace(line({}), phuket, search);
    expect(plain.place).toBeNull();
    expect(asked.map((q) => [q.q, q.degrees])).toEqual([
      ['Patong Beach', 0.2],
      ['หาดป่าตอง', 0.2],
    ]);
    asked.length = 0;
    const trip = line({ name_en: 'Koh Larn (Coral Island)', subtype: 'island day trip' });
    expect(farReaching(trip)).toBe(true);
    await findOsmPlace(trip, phuket, search);
    expect(asked.map((q) => [q.q, q.degrees])).toEqual([
      ['Koh Larn', 0.2],
      ['หาดป่าตอง', 0.2],
      ['Koh Larn', 1],
      ['หาดป่าตอง', 1],
    ]);
  });

  it('stops at the first accepted answer and reports the nearest turned-down one', async () => {
    const found = await findOsmPlace(line({}), phuket, () =>
      Promise.resolve(reply('patong-beach')),
    );
    expect(found).toMatchObject({ queries: 1, place: { sourceId: 'w151234567' } });
    const missed = await findOsmPlace(
      line({ name_en: 'Freedom Beach', name_local: null }),
      phuket,
      () => Promise.resolve([hotel!]),
    );
    expect(missed.place).toBeNull();
    expect(missed.nearestRejected?.name).toBe('Patong Beach Hotel');
  });
});

describe('the Nominatim search client', () => {
  it('spaces requests a second apart, names itself and asks a repeated question once', async () => {
    let clock = 0;
    const calls: { url: string; agent: string | null; at: number }[] = [];
    const fetcher = ((url: string, init?: RequestInit) => {
      calls.push({ url, agent: new Headers(init?.headers).get('User-Agent'), at: clock });
      return Promise.resolve(new Response(JSON.stringify(reply('hoover-dam')), { status: 200 }));
    }) as typeof fetch;
    const search = createNominatimSearch({
      fetcher,
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    const query = { q: 'Hoover Dam', lat: 36.016, lng: -114.7377, degrees: 0.2 };
    await Promise.all([search(query), search({ ...query, q: 'Boulder Dam' }), search(query)]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.at - calls[0]!.at).toBeGreaterThanOrEqual(MIN_REQUEST_INTERVAL_MS);
    expect(calls.every((call) => call.agent === NOMINATIM_USER_AGENT)).toBe(true);
    const url = new URL(calls[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      q: 'Hoover Dam',
      format: 'jsonv2',
      addressdetails: '1',
      namedetails: '1',
      extratags: '1',
      bounded: '1',
      viewbox: '-114.9377,36.2160,-114.5377,35.8160',
    });
  });

  it('fails the attempt on a refused request so the job retries later', async () => {
    const search = createNominatimSearch({
      fetcher: () => Promise.resolve(new Response('', { status: 429 })),
      sleep: () => Promise.resolve(),
    });
    await expect(search({ q: 'x', lat: 0, lng: 0, degrees: 0.2 })).rejects.toThrow('429');
  });
});
