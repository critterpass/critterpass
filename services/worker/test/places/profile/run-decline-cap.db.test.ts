/**
 * A profile run that ends without a profile on a migrated Postgres, with SearXNG replayed at the
 * network edge: a declined run downloads and stores no photo, and a run stopped at the spent daily
 * cap marks the place so nothing queues it again until the cap resets at midnight UTC.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, createGateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { PLACES_QUEUES } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { runPlaceProfile, type PlaceProfileDeps } from '../../../src/places/profile/run';
import { createPlaceSearch } from '../../../src/places/profile/search';
import { queueWarmProfiles } from '../../../src/places/profile/warm';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

const SEARX = 'http://searxng.test:8080';
const images = (
  JSON.parse(readFileSync(new URL('./fixtures/searx-images.json', import.meta.url), 'utf8')) as {
    response: { body: unknown };
  }
).response.body;

let harness: JobsHarness;
let destinationId: string;

/** SearXNG finds the place's images but no web page about it; anything else is unexpected. */
function network() {
  const calls: string[] = [];
  const send = (input: unknown): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url.startsWith(`${SEARX}/search`)) {
      const body =
        new URL(url).searchParams.get('categories') === 'images' ? images : { results: [] };
      return Promise.resolve(
        new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
      );
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  return { fetch: send as typeof fetch, calls };
}

function deps(net: ReturnType<typeof network>, dailyCapMicros: number) {
  const puts: string[] = [];
  const gateway = createGateway({ apiKey: 'fixture-key', fetch: net.fetch, maxAttempts: 1 });
  const value: PlaceProfileDeps = {
    gateway,
    decisions: createDecisionClient({ apiKey: 'fixture-key', fetch: net.fetch, gateway }),
    search: createPlaceSearch({
      searxUrl: SEARX,
      engines: ['bing'],
      gapMs: 0,
      pool: harness.pool,
      fetch: net.fetch,
    }),
    store: {
      put: (key) => {
        puts.push(key);
        return Promise.resolve();
      },
    },
    tier: 'fast',
    dailyCapMicros,
    fetch: net.fetch,
  };
  return { value, puts };
}

async function place(name: string): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, editorial)
     VALUES ($1, $2, 'museum', 11.93, 108.43, '{"essential": true}') RETURNING id`,
    [destinationId, name],
  );
  return rows[0]?.id as string;
}

const row = (poiId: string) =>
  withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ status: string; error: string | null; photos: unknown }>(
      'SELECT status, error, photos FROM place_profiles WHERE poi_id = $1',
      [poiId],
    );
    return rows[0];
  });

beforeAll(async () => {
  harness = await startJobsHarness();
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  destinationId = rows[0]?.id as string;
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

describe('places.profile without a profile', { timeout: 60_000 }, () => {
  it('stores no photo for a declined place', async () => {
    const id = await place('Hẻm Không Tên');
    const net = network();
    const { value, puts } = deps(net, 1_000_000);
    expect(await runPlaceProfile(harness.pool, value, { poiId: id })).toEqual({
      outcome: 'declined',
      reason: 'no_pages',
      costMicros: 0,
    });
    // Let the image search that started beside the web search settle.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(puts).toEqual([]);
    // Only the searches and the labelling model were called: no image was downloaded.
    const downloads = net.calls.filter(
      (url) => !url.startsWith(`${SEARX}/search`) && !/typesafe|deepseek/u.test(url),
    );
    expect(downloads).toEqual([]);
    expect(await row(id)).toMatchObject({ status: 'declined', error: 'no_pages', photos: [] });
  });

  it('marks a place stopped at the spent cap, and warms it again once the cap resets', async () => {
    const boss = await harness.startRuntime([]);
    await boss.createQueue(PLACES_QUEUES.profile, { policy: 'stately' });
    const id = await place('Đồi Mộng Mơ');
    const net = network();
    const capped = deps(net, 0).value;
    expect(await runPlaceProfile(harness.pool, capped, { poiId: id })).toEqual({
      outcome: 'skipped',
      reason: 'daily_cap',
    });
    expect(net.calls).toEqual([]);
    expect(await row(id)).toMatchObject({ status: 'failed', error: 'daily_cap' });

    const options = { limit: 30, priority: 0, spacingSeconds: 0 };
    expect(await queueWarmProfiles(harness.pool, boss, destinationId, options)).toBe(0);

    await withSystem(harness.pool, (tx) =>
      tx.query(
        "UPDATE place_profiles SET updated_at = now() - interval '1 day' WHERE poi_id = $1",
        [id],
      ),
    );
    expect(await queueWarmProfiles(harness.pool, boss, destinationId, options)).toBe(1);
  });
});
