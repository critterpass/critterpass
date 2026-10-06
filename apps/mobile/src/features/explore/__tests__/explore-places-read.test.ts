/**
 * Explore's places outside a trip: the phone's rows plus the api's browse of the destination, so an
 * open-data place the phone never synced shows on the map, in the list, in the picks and in the
 * saved list; offline, each read answers from its last good copy. The browse body is shaped as the
 * api's `searchPlaces` answers it (services/api/src/places/search.ts).
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, jest } from '@jest/globals';

import { placeCache, placePath, readPlace } from '@/data/places/place-read';
import {
  createLastGoodCache,
  type ReaderResponse,
  type TravelDataReader,
} from '@/data/travel-data/client';
import { dataOf } from '@/data/travel-data/freshness';
import { recordedReader } from '@/data/travel-data/test-support/recorded-reader';

import { browsePath, readDestinationPlaces, withBrowsed, type BrowsePlace } from '../map-queries';
import type { MapPoi } from '../map-model';
import { browsedRank, placeFacts } from '../places/place-facts';
import { countKinds, picksWithBrowsed } from '../queries';
import { apiSubjects, readMissingPlaces } from '../saved-queries';
import { centreOf } from '../search/use-addresses';
import { knownAddresses } from '../search/use-phone-addresses';

const DA_NANG = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03';
const TEMPLE = '0199b7a0-4c1e-7d2a-8f00-3a6b5c4d2e11';
const BANH_XEO = '0199b7a0-4c1e-7d2a-8f00-3a6b5c4d2e22';
const HOTEL = '0199b7a0-4c1e-7d2a-8f00-3a6b5c4d2e33';

const browseBody = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures', 'places-browse-da-nang.json'), 'utf8'),
) as unknown;

function browseReader(): TravelDataReader & { online: boolean; paths: string[] } {
  const reader = {
    online: true,
    paths: [] as string[],
    getJson(requested: string): Promise<ReaderResponse> {
      reader.paths.push(requested);
      if (!reader.online) return Promise.reject(new TypeError('Network request failed'));
      return Promise.resolve({ status: 200, body: browseBody });
    },
  };
  return reader;
}

let cacheId = 0;
const freshCache = () => createLastGoodCache(`explore-browse-test-${String((cacheId += 1))}`);

async function browsed(): Promise<readonly BrowsePlace[]> {
  return dataOf(await readDestinationPlaces(browseReader(), DA_NANG, freshCache()))?.results ?? [];
}

const heldTemple: MapPoi = {
  id: TEMPLE,
  name: 'Linh Ung Pagoda',
  nameLocal: 'Chùa Linh Ứng',
  category: 'temple_shrine',
  lat: 16.1003,
  lng: 108.2778,
  hours: { mon: [] },
  mustSee: true,
  written: true,
  bestTime: 'Sunrise',
};

describe('the destination browse', () => {
  it('reads online, then answers offline from its last good copy', async () => {
    const reader = browseReader();
    const cache = freshCache();
    const online = await readDestinationPlaces(reader, DA_NANG, cache);
    expect(online.status).toBe('ok');
    // The row with no name is skipped, never shown blank.
    expect(dataOf(online)?.results.map((place) => place.id)).toEqual([TEMPLE, BANH_XEO, HOTEL]);
    reader.online = false;
    const offline = await readDestinationPlaces(reader, DA_NANG, cache);
    expect(offline).toMatchObject({ status: 'stale', reason: 'offline', source: 'cache' });
    expect(dataOf(offline)).toEqual(dataOf(online));
    expect(reader.paths).toEqual([browsePath(DA_NANG), browsePath(DA_NANG)]);
  });

  it('is missing offline when the destination was never browsed', async () => {
    const reader = browseReader();
    reader.online = false;
    await expect(readDestinationPlaces(reader, DA_NANG, freshCache())).resolves.toEqual({
      status: 'missing',
      reason: 'offline',
    });
  });
});

describe('the map', () => {
  it('adds a place the phone never synced, keeps the phone row for one it holds, skips stays', async () => {
    const places = withBrowsed([heldTemple], await browsed(), false);
    expect(places.map((place) => place.id)).toEqual([TEMPLE, BANH_XEO]);
    expect(places[0]).toBe(heldTemple);
    expect(places[1]).toMatchObject({ name: 'Bánh Xèo Bà Dưỡng', mustSee: false, hours: null });
  });

  it('shows a never-synced place with the hours, must-see and note lines the browse sends', async () => {
    const [temple, banhXeo] = withBrowsed([], await browsed(), false);
    expect(temple).toMatchObject({
      id: TEMPLE,
      hours: { weekly: { mon: [['06:00', '21:30']] } },
      mustSee: true,
      written: true,
      bestTime: 'Before 07:00',
    });
    expect(banhXeo).toMatchObject({ hours: null, mustSee: false, written: false, bestTime: null });
  });
});

describe('the list', () => {
  it('ranks a recommended unsynced place, names its area, and lets the phone row win', async () => {
    const facts = placeFacts(
      [{ id: TEMPLE, curation: 'editorial', pick_rank: null, address: null, must_see: 1 }],
      await browsed(),
      'Đà Nẵng',
    );
    expect(facts.get(TEMPLE)).toEqual({ rank: 0, area: null });
    expect(facts.get(BANH_XEO)).toEqual({ rank: null, area: 'Hải Châu' });
    expect(facts.get(HOTEL)?.rank).toBe(14);
  });

  it('ranks browse-only places as the phone ranks its own: must-see, curated, then picks', async () => {
    const [temple, banhXeo, hotel] = await browsed();
    const rank = (place: BrowsePlace | undefined) =>
      place === undefined ? -1 : browsedRank(place);
    expect([rank(temple), rank(banhXeo), rank(hotel)]).toEqual([0, null, 14]);
    if (banhXeo === undefined) throw new Error('expected the browse fixture');
    expect(browsedRank({ ...banhXeo, recommended: true })).toBe(1);
  });
});

describe('picks and kinds', () => {
  it('follows the phone picks with recommended unsynced places, never a stay', async () => {
    const held = [{ poiId: 'held', name: 'Cầu Rồng', nameLocal: null, category: 'other' }];
    const picks = picksWithBrowsed(held, await browsed(), 10, false);
    expect(picks.map((pick) => pick.poiId)).toEqual(['held', TEMPLE]);
    expect(picksWithBrowsed(held, await browsed(), 1, false)).toHaveLength(1);
  });

  it('counts each place once across the phone and the browse', async () => {
    const counts = countKinds([{ id: TEMPLE, category: 'temple_shrine' }], await browsed());
    expect(new Map(counts.map((row) => [row.category, row.n]))).toEqual(
      new Map([
        ['temple_shrine', 1],
        ['food', 1],
        ['stay', 1],
      ]),
    );
  });

  it('centres the destination on the browse when the phone holds none of its places', async () => {
    expect(centreOf({ lat: 1, lng: 2 }, await browsed())).toEqual({ lat: 1, lng: 2 });
    const centre = centreOf({ lat: null, lng: null }, await browsed());
    expect(centre?.lat).toBeCloseTo((16.1003 + 16.0581 + 16.0612) / 3, 6);
    expect(centreOf(undefined, [])).toBeNull();
  });
});

describe('the saved list', () => {
  it('reads a saved place the phone lacks, then shows it offline from the kept copy', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'place-open-data-with-profile'] });
    const online = await readMissingPlaces(reader, [TEMPLE]);
    const subjects = apiSubjects(online, [{ id: DA_NANG, name: 'Đà Nẵng', slug: 'da-nang' }]);
    expect(subjects.get(TEMPLE)).toEqual({
      kind: 'poi',
      name: 'Chùa Linh Ứng',
      category: 'sight',
      destinationId: DA_NANG,
      destinationName: 'Đà Nẵng',
      destinationSlug: 'da-nang',
    });
    reader.online = false;
    expect((await readMissingPlaces(reader, [TEMPLE])).map((place) => place.id)).toEqual([TEMPLE]);
  });

  it('leaves out a place the api does not know', async () => {
    const reader = recordedReader({ '/v1/places/': [404, 'error-not-found'] });
    await expect(readMissingPlaces(reader, ['gone'])).resolves.toEqual([]);
  });
});

describe('search addresses', () => {
  it('reads the address of a place seen through the api when the phone has no row', async () => {
    const reader = recordedReader({ '/v1/places/': [200, 'place-open-data-with-profile'] });
    await readPlace(reader, TEMPLE);
    const found = knownAddresses(
      [TEMPLE, 'held', 'never-seen'],
      [{ id: 'held', address: '1 Bạch Đằng' }],
      placeCache(),
    );
    expect(found).toEqual(
      new Map([
        ['held', '1 Bạch Đằng'],
        [TEMPLE, 'Hoàng Sa, Thọ Quang, Sơn Trà, Đà Nẵng'],
      ]),
    );
    expect(placeCache().get(placePath('never-seen'))).toBeUndefined();
  });
});
