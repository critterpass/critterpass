/**
 * The must-dos step's places come through the api, not the phone's place table: a typed search
 * online, the destination's browse for the examples, and offline the browse's last good copy
 * matched on the phone. A place the phone never synced is a full candidate, with its pill and its
 * note's line from what the api sends. Bodies are shaped as `searchPlaces` answers them
 * (services/api/src/places/search.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { createLastGoodCache } from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';

import type { ApiRead, SetupServices } from '../../data/services';
import { examplePlaces, guidePlaces } from '../examples';
import { browsePath, readBrowse, readerOf } from '../places';
import { resultOf, searchCandidates, tripDates } from '../search';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));

const SAIHOJI = '0199c1a0-0000-7000-8000-00000000f003';
const GIOJI = '0199c1a0-0000-7000-8000-00000000f007';
const DATES = tripDates('2027-04-02', '2027-04-09');

let destinationSeq = 0;
/** Each test its own destination, so one test's kept browse never answers another's. */
const freshDestination = () =>
  `0199c1a0-0000-7000-8000-${String((destinationSeq += 1)).padStart(12, '0')}`;

function api() {
  const state = { online: true, paths: [] as string[] };
  const services: SetupServices = {
    getJson(requested): Promise<ApiRead> {
      state.paths.push(requested);
      if (!state.online) return Promise.resolve({ kind: 'offline' });
      const url = new URL(requested, 'https://api.test');
      if (url.pathname !== '/v1/places/search') {
        return Promise.resolve({ kind: 'error', status: 404, code: 'not_found' });
      }
      const body = url.searchParams.has('q')
        ? fixture('places-search-moss')
        : fixture('places-browse-kyoto');
      return Promise.resolve({ kind: 'ok', body });
    },
    openUrl: () => Promise.resolve(),
    apiUrl: (route) => `https://api.test${route}`,
    now: () => 0,
  };
  return { services, state };
}

describe('searching for a must-do', () => {
  it('online, offers never-synced places with the pill and line the api sends', async () => {
    const { services, state } = api();
    const found = await searchCandidates(services, freshDestination(), 'moss');
    expect(found.offline).toBe(false);
    expect(state.paths[0]).toMatch(/^\/v1\/places\/search\?q=moss&limit=6&destination_id=/u);
    const results = found.places.map((place) => resultOf(place, DATES, false));
    expect(results).toEqual([
      {
        id: SAIHOJI,
        name: 'Saihō-ji',
        blurb: 'The moss garden, by reservation only.',
        pill: { kind: 'book_ahead', by: null },
      },
      {
        id: GIOJI,
        name: 'Gio-ji',
        blurb: '32 Sagatoriimoto Kozakacho, Ukyo Ward, Kyoto',
        pill: { kind: 'fits', day: null },
      },
    ]);
  });

  it('offline, matches the destination browse kept from the last time there was signal', async () => {
    const { services, state } = api();
    const destination = freshDestination();
    expect((await readBrowse(readerOf(services), destination)).status).toBe('ok');
    state.online = false;
    const found = await searchCandidates(services, destination, 'nishiki');
    expect(found.offline).toBe(true);
    const [market] = found.places.map((place) => resultOf(place, DATES, true));
    // Closed on every trip day by its hours: the pill says so before any draft exists.
    expect(market).toEqual({
      id: '0199c1a0-0000-7000-8000-00000000f004',
      name: '錦市場',
      blurb: 'Nishikikoji-dori, Nakagyo Ward, Kyoto',
      pill: { kind: 'clash' },
    });
  });

  it('offline with no kept browse, finds nothing and says it is offline', async () => {
    const { services, state } = api();
    state.online = false;
    await expect(searchCandidates(services, freshDestination(), 'moss')).resolves.toEqual({
      places: [],
      offline: true,
    });
  });
});

describe('the destination browse', () => {
  it('reads online, keeps its last good copy, and answers from it offline', async () => {
    const { services, state } = api();
    const cache = createLastGoodCache('must-do-browse-test');
    const destination = freshDestination();
    const online = await readBrowse(readerOf(services), destination, cache);
    // The nameless row is skipped, never shown blank.
    expect(dataOf(online)?.results).toHaveLength(5);
    state.online = false;
    const offline = await readBrowse(readerOf(services), destination, cache);
    expect(offline).toMatchObject({ status: 'stale', reason: 'offline', source: 'cache' });
    expect(dataOf(offline)).toEqual(dataOf(online));
    expect(state.paths).toEqual([browsePath(destination), browsePath(destination)]);
  });
});

describe('example must-dos from the browse', () => {
  it('offers the must-see and best picks with something to eat, never a stay or an unchosen place', async () => {
    const { services } = api();
    const browse = dataOf(await readBrowse(readerOf(services), freshDestination()));
    const rows = guidePlaces(browse?.results ?? []);
    expect(rows.map((row) => row.name)).toEqual([
      'Fushimi Inari Taisha',
      'Nishiki Market',
      'Saihō-ji',
      'Kyoto Tower Hotel',
    ]);
    expect(examplePlaces(rows, false).map((place) => place.name)).toEqual([
      'Fushimi Inari Taisha',
      'Saihō-ji',
      'Nishiki Market',
    ]);
  });
});
