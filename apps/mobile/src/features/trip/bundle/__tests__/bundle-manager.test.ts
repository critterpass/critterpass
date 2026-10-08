/**
 * Saving trip days on the phone: a day downloads tickets, then phrases, then the map; a day already
 * saved at its version downloads nothing; a new version downloads only the file that changed; the
 * map waits when the phone is nearly full; and a download cut off resumes with what is missing.
 * The api and the file system are the recorded boundary; the saved state is the real database.
 */

import { afterEach, describe, expect, it } from '@jest/globals';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  MAP_MIN_FREE_BYTES,
  readSavedDays,
  refreshTripDays,
  type WireDay,
} from '../bundle-manager';
import type { TripDayServices } from '../services';

const TRIP = '0192f000-0000-7000-8000-00000000f301';

function day(version: number, mapKey = 'maps/bali-v1.pmtiles'): WireDay {
  return {
    local_date: '2026-10-15',
    version,
    built_at: '2026-10-14T12:00:00Z',
    assets: [
      {
        kind: 'map_region',
        key: mapKey,
        bytes: 50_000_000,
        label: 'Trail map',
        ref_id: null,
        url: `https://m/${mapKey}`,
      },
      {
        kind: 'phrase_audio',
        key: 'phrases/id.m4a',
        bytes: 2_000_000,
        label: 'Phrase cards',
        ref_id: null,
        url: 'https://m/p',
      },
      {
        kind: 'attachment',
        key: 'docs/tickets.pdf',
        bytes: 300_000,
        label: 'Hot spring tickets',
        ref_id: null,
        url: 'https://m/t',
      },
    ],
    places: [],
    fx: [],
  };
}

function device(body: { days: WireDay[] }, free: number | null = 10_000_000_000) {
  const files = new Set<string>();
  const downloads: string[] = [];
  let failNext = 0;
  const services: TripDayServices = {
    getJson: () =>
      Promise.resolve({ kind: 'ok', value: { sections: { days: { items: body.days } } } }),
    download: (url, folder, name) => {
      if (failNext > 0) {
        failNext -= 1;
        return Promise.resolve(null);
      }
      downloads.push(url);
      const uri = `file:///trip-days/${folder}/${name}`;
      files.add(uri);
      return Promise.resolve(uri);
    },
    exists: (uri) => files.has(uri),
    removeFolder: () => files.clear(),
    folderBytes: () => 0,
    freeBytes: () => free,
    now: () => Date.parse('2026-10-14T19:02:00Z'),
  };
  return { services, downloads, failOnce: (n: number) => (failNext = n) };
}

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('trip day bundle', () => {
  it('saves tickets first, and a day already saved costs nothing', async () => {
    stack = await openTestLocalFirst();
    const body = { days: [day(1)] };
    const phone = device(body);
    await refreshTripDays(stack.db, phone.services, TRIP);
    expect(phone.downloads).toEqual([
      'https://m/t',
      'https://m/p',
      'https://m/maps/bali-v1.pmtiles',
    ]);
    await refreshTripDays(stack.db, phone.services, TRIP);
    expect(phone.downloads).toHaveLength(3);

    // Version 2 moves the map only: that file alone downloads.
    body.days = [day(2, 'maps/bali-v2.pmtiles')];
    await refreshTripDays(stack.db, phone.services, TRIP);
    expect(phone.downloads.slice(3)).toEqual(['https://m/maps/bali-v2.pmtiles']);
    const [saved] = await readSavedDays(stack.db, TRIP);
    expect(saved?.version).toBe(2);
    expect(saved?.missing).toEqual([]);
  });

  it('leaves the map out on a nearly full phone and says so', async () => {
    stack = await openTestLocalFirst();
    const phone = device({ days: [day(1)] }, MAP_MIN_FREE_BYTES + 10_000_000);
    await refreshTripDays(stack.db, phone.services, TRIP);
    const [saved] = await readSavedDays(stack.db, TRIP);
    expect(saved?.assets.map((asset) => asset.kind)).toEqual(['attachment', 'phrase_audio']);
    expect(saved?.missing).toEqual([{ kind: 'map_region', label: 'Trail map', reason: 'space' }]);
  });

  it('resumes a cut-off download with only what is missing', async () => {
    stack = await openTestLocalFirst();
    const phone = device({ days: [day(1)] });
    phone.failOnce(2);
    await refreshTripDays(stack.db, phone.services, TRIP);
    expect(phone.downloads).toEqual(['https://m/maps/bali-v1.pmtiles']);
    await refreshTripDays(stack.db, phone.services, TRIP);
    expect(phone.downloads).toEqual([
      'https://m/maps/bali-v1.pmtiles',
      'https://m/t',
      'https://m/p',
    ]);
    const [saved] = await readSavedDays(stack.db, TRIP);
    expect(saved?.missing).toEqual([]);
  });
});
