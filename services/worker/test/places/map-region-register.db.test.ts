/**
 * `places.map_region_register` against a real migrated Postgres: a pack found on the tiles bucket
 * gets its row once, with the size the bucket states, and nothing already registered changes. The
 * bucket is the network boundary: its answers are the recorded HEAD responses in
 * fixtures/tiles-head-responses.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { registerMapRegions } from '../../src/places/map-region-register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

interface Recorded {
  readonly status: number;
  readonly headers: Record<string, string>;
}
const recorded = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures', 'tiles-head-responses.json'), 'utf8'),
) as { readonly found: Recorded; readonly absent: Recorded };

const BASE = 'https://tiles.test.example';
const FOUND_BYTES = Number(recorded.found.headers['content-length']);

let harness: JobsHarness;
const q = <Row extends object>(sql: string, params: unknown[] = []) =>
  harness.pool.query<Row>(sql, params);

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(async () => {
  await q('DELETE FROM map_regions');
});

async function destination(slug: string): Promise<string> {
  const { rows } = await q<{ id: string }>(
    `INSERT INTO destinations (slug, name, tz) VALUES ($1, $1, 'Asia/Ho_Chi_Minh')
     ON CONFLICT (slug) DO UPDATE SET name = excluded.name RETURNING id`,
    [slug],
  );
  return rows[0]?.id ?? '';
}

async function regionsOf(slug: string) {
  const { rows } = await q<{ pmtiles_key: string; bytes: string; version: string }>(
    `SELECT m.pmtiles_key, m.bytes, m.version FROM map_regions m
       JOIN destinations d ON d.id = m.destination_id
      WHERE d.slug = $1 ORDER BY m.version`,
    [slug],
  );
  return rows;
}

/** The bucket: the recorded "found" answer for the keys it holds, the recorded 404 for the rest. */
function bucket(keys: readonly string[], options: { readonly limitAfter?: number } = {}) {
  const asked: string[] = [];
  const fetcher: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    asked.push(url);
    expect(init?.method).toBe('HEAD');
    if (options.limitAfter !== undefined && asked.length > options.limitAfter) {
      return Promise.resolve(new Response(null, { status: 429 }));
    }
    const answer = keys.some((key) => url === `${BASE}/${key}`) ? recorded.found : recorded.absent;
    return Promise.resolve(new Response(null, { status: answer.status, headers: answer.headers }));
  };
  return { fetcher, asked };
}

describe('registerMapRegions', () => {
  it('registers a pack found on the bucket once, with its size', async () => {
    await destination('reg-da-lat');
    await destination('reg-no-pack');
    const tiles = bucket(['reg-da-lat/tiles-v1.pmtiles']);

    const first = await registerMapRegions(harness.pool, {
      tilesBaseUrl: BASE,
      fetcher: tiles.fetcher,
    });
    expect(first.registered).toBe(1);
    expect(first.rateLimited).toBe(false);
    expect(await regionsOf('reg-da-lat')).toEqual([
      { pmtiles_key: 'reg-da-lat/tiles-v1.pmtiles', bytes: String(FOUND_BYTES), version: 'v1' },
    ]);
    expect(await regionsOf('reg-no-pack')).toEqual([]);

    // The next run looks for the version after the one it registered, and adds nothing.
    tiles.asked.length = 0;
    const second = await registerMapRegions(harness.pool, {
      tilesBaseUrl: BASE,
      fetcher: tiles.fetcher,
    });
    expect(second.registered).toBe(0);
    expect(tiles.asked).toContain(`${BASE}/reg-da-lat/tiles-v2.pmtiles`);
    expect(tiles.asked).not.toContain(`${BASE}/reg-da-lat/tiles-v1.pmtiles`);
    expect(await regionsOf('reg-da-lat')).toHaveLength(1);
  });

  it('inserts one row when two runs overlap', async () => {
    await destination('reg-overlap');
    const tiles = bucket(['reg-overlap/tiles-v1.pmtiles']);
    const reports = await Promise.all([
      registerMapRegions(harness.pool, { tilesBaseUrl: BASE, fetcher: tiles.fetcher }),
      registerMapRegions(harness.pool, { tilesBaseUrl: BASE, fetcher: tiles.fetcher }),
    ]);
    expect(reports[0].registered + reports[1].registered).toBe(1);
    expect(await regionsOf('reg-overlap')).toHaveLength(1);
  });

  it('leaves a registered pack as it is and adds the rebuilt one beside it', async () => {
    const id = await destination('reg-rebuilt');
    await q(
      `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
       VALUES ($1, 'reg-rebuilt/tiles-v1.pmtiles', 111, 'v1')`,
      [id],
    );
    const tiles = bucket(['reg-rebuilt/tiles-v1.pmtiles', 'reg-rebuilt/tiles-v2.pmtiles']);
    await registerMapRegions(harness.pool, { tilesBaseUrl: BASE, fetcher: tiles.fetcher });
    expect(await regionsOf('reg-rebuilt')).toEqual([
      { pmtiles_key: 'reg-rebuilt/tiles-v1.pmtiles', bytes: '111', version: 'v1' },
      { pmtiles_key: 'reg-rebuilt/tiles-v2.pmtiles', bytes: String(FOUND_BYTES), version: 'v2' },
    ]);
  });

  it('stops asking when the host says 429, and registers nothing from it', async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      await destination(`reg-many-${String(n)}`);
    }
    const tiles = bucket([], { limitAfter: 2 });
    const report = await registerMapRegions(harness.pool, {
      tilesBaseUrl: BASE,
      fetcher: tiles.fetcher,
    });
    expect(report.rateLimited).toBe(true);
    expect(report.registered).toBe(0);
    // The four probes in flight when the 429 arrived may finish; nothing new starts after it.
    expect(tiles.asked.length).toBeLessThanOrEqual(2 + 4);
  });

  it('registers nothing when the bucket cannot be reached', async () => {
    await destination('reg-offline');
    const report = await registerMapRegions(harness.pool, {
      tilesBaseUrl: BASE,
      fetcher: () => Promise.reject(new TypeError('fetch failed')),
    });
    expect(report.registered).toBe(0);
    expect(report.unanswered).toBe(report.probed);
    expect(await regionsOf('reg-offline')).toEqual([]);
  });
});
