/**
 * The shared place search on the local-first stack: the crew's ideas and the destination's curated
 * places as they sync, the server's places after them, and offline what the phone searched.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import type { PlaceCandidate } from '../match-places';
import type { FetchPlaces } from '../server-name-search';
import { useTripPlaceSearch } from '../use-trip-place-search';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

const BALI = '0199a3f0-0000-7000-8000-00000000b001';
const TRIP = '0199a3f0-0000-7000-8000-00000000f001';
const BILLY = '0199a3f0-0000-7000-8000-0000000000b1';
const KOPI = '0199a3f0-0000-7000-8000-0000000000b2';
const TEMPLE = '0199a3f0-0000-7000-8000-0000000000b3';
const OPEN_DATA = '0199a3f0-0000-7000-8000-0000000000b4';

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function seeded() {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  const poi = (id: string, name: string, category: string, tags: string) =>
    stack.db.execute(
      `INSERT INTO pois (id, destination_id, name, category, lat, lng, status, tags, hours)
       VALUES (?, ?, ?, ?, -8.37, 115.13, 'active', ?, '{"weekly":{"mo":[["07:00","18:00"]]}}')`,
      [id, BALI, name, category, tags],
    );
  await poi(BILLY, 'Billy’s Terrace Cafe', 'food', '["coffee"]');
  await poi(KOPI, 'Kopi Sawah', 'food', '["coffee"]');
  await poi(TEMPLE, 'Pura Luhur Batukaru', 'temple_shrine', '[]');
  await stack.db.execute(
    `INSERT INTO trip_ideas (id, trip_id, poi_id, name, category, lat, lng, created_at)
     VALUES ('0199a3f0-0000-7000-8000-0000000000c1', ?, ?, 'Kopi Sawah', 'food', -8.37, 115.13,
       '2026-10-01T00:00:00Z')`,
    [TRIP, KOPI],
  );
  return stack;
}

const serverPlace: PlaceCandidate = {
  id: OPEN_DATA,
  poiId: OPEN_DATA,
  name: 'Kopi Desa',
  nameLocal: null,
  category: 'food',
  lat: -8.38,
  lng: 115.14,
  tags: [],
  source: 'server',
};

describe('the shared place search', () => {
  it('lists the crew’s ideas first, then curated places, then the server’s', async () => {
    const stack = await seeded();
    const fetchPlaces = jest.fn<FetchPlaces>(() =>
      Promise.resolve([serverPlace, { ...serverPlace, id: KOPI, poiId: KOPI }]),
    );
    const { result } = await renderHook(
      () => useTripPlaceSearch({ destinationId: BALI, tripId: TRIP, query: 'kopi', fetchPlaces }),
      { wrapper: stack.wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2), { timeout: 3000 });
    expect(result.current.rows.map((row) => [row.name, row.source])).toEqual([
      ['Kopi Sawah', 'idea'],
      ['Kopi Desa', 'server'],
    ]);
  });

  it('offline, answers by kind of place from the phone and says what it searched', async () => {
    const stack = await seeded();
    stack.network.set(false);
    const fetchPlaces = jest.fn<FetchPlaces>(() => Promise.resolve([serverPlace]));
    const { result } = await renderHook(
      () =>
        useTripPlaceSearch({
          destinationId: BALI,
          tripId: TRIP,
          query: 'coffee near the terraces',
          fetchPlaces,
        }),
      { wrapper: stack.wrapper },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.offline).toBe(true);
    expect(result.current.rows.map((row) => row.name)).toEqual([
      'Kopi Sawah',
      'Billy’s Terrace Cafe',
    ]);
    expect(result.current.counts).toEqual({ saved: 1, curated: 3 });
    expect(result.current.hours.get(BILLY)).toContain('07:00');
    expect(fetchPlaces).not.toHaveBeenCalled();
  });
});
