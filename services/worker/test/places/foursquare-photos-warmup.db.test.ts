/**
 * The Foursquare photo warm-up against real Postgres (Testcontainers). Foursquare's Place Details
 * is the one network boundary: a photos-only call answers with the photo list of the Place Details
 * response recorded 2026-10-03 (Fushimi Inari Taisha), and the cap runs through the real
 * `app.reserve_foursquare_call`.
 */
import { readFileSync } from 'node:fs';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { JobLogger } from '../../src/boss/define-job';
import {
  runFoursquarePhotoWarmup,
  type FoursquarePhotoWarmupConfig,
} from '../../src/places/foursquare-photos-warmup';

const details = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/domain/test/places/fixtures/foursquare-place-details.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { photos: unknown[] };
const recorded = { photos: details.photos };

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinations: Record<'kyoto' | 'nara', string>;
let requested: string[];
let warnings: string[];

const logger: JobLogger = {
  info: () => undefined,
  warn: (_details, message) => warnings.push(message),
  error: () => undefined,
};

function config(overrides: Partial<FoursquarePhotoWarmupConfig> = {}): FoursquarePhotoWarmupConfig {
  return {
    apiKey: 'test-key',
    monthlyCallCap: 100,
    fetch: (input) => {
      requested.push(input);
      return Promise.resolve(Response.json(recorded));
    },
    ...overrides,
  };
}

async function insertPoi(
  name: string,
  options: { curation?: string; fsq?: string; slug?: 'kyoto' | 'nara'; mustSee?: boolean } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, source_ids, editorial)
     VALUES ($1, $2, 'temple_shrine', 34.9671, 135.7727, $3, $4, $5) RETURNING id`,
    [
      destinations[options.slug ?? 'kyoto'],
      name,
      options.curation ?? 'editorial',
      options.fsq === undefined ? {} : { fsq_os: options.fsq },
      options.mustSee === true ? { must_see: true } : {},
    ],
  );
  return rows[0]!.id;
}

async function photosOf(poiId: string): Promise<number> {
  const { rows } = await pool.query('SELECT 1 FROM poi_foursquare_photos WHERE poi_id = $1', [
    poiId,
  ]);
  return rows.length;
}

async function callsCounted(): Promise<number> {
  const { rows } = await pool.query<{ details_calls: number }>(
    'SELECT details_calls FROM foursquare_api_usage',
  );
  return rows[0]?.details_calls ?? 0;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string; slug: 'kyoto' | 'nara' }>(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('kyoto', 'Kyoto', 'live', 'Asia/Tokyo'), ('nara', 'Nara', 'live', 'Asia/Tokyo')
     RETURNING id, slug`,
  );
  destinations = Object.fromEntries(rows.map((row) => [row.slug, row.id])) as typeof destinations;
}, 180_000);

beforeEach(async () => {
  requested = [];
  warnings = [];
  await pool.query('DELETE FROM foursquare_api_usage');
  await pool.query('DELETE FROM pois');
});

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('runFoursquarePhotoWarmup', () => {
  it('reads the photos of curated places with a Foursquare id, one photos-only call each', async () => {
    const linked = await insertPoi('Fushimi Inari Taisha', { fsq: 'aaa' });
    const matched = await insertPoi('Tofuku-ji');
    await pool.query(
      "INSERT INTO poi_foursquare_ids (poi_id, fsq_place_id, confidence) VALUES ($1, 'bbb', 0.9)",
      [matched],
    );
    const noId = await insertPoi('Quiet garden');
    const openData = await insertPoi('Open data only', { curation: 'auto', fsq: 'ccc' });

    const report = await runFoursquarePhotoWarmup(pool, config(), { maxCalls: 10 }, logger);

    expect(report).toEqual({
      places: 2,
      calls: 2,
      placesWithPhotos: 2,
      placesWithoutPhotos: 0,
      photosKept: 10,
      failed: 0,
      capLeft: 100,
      dryRun: false,
    });
    expect(requested.sort()).toEqual([
      'https://places-api.foursquare.com/places/aaa?fields=photos',
      'https://places-api.foursquare.com/places/bbb?fields=photos',
    ]);
    expect(await photosOf(linked)).toBe(5);
    expect(await photosOf(matched)).toBe(5);
    expect(await photosOf(noId)).toBe(0);
    expect(await photosOf(openData)).toBe(0);
    expect(await callsCounted()).toBe(2);
  });

  it('only counts on a dry run: no call, nothing counted against the cap, nothing written', async () => {
    const poi = await insertPoi('Fushimi Inari Taisha', { fsq: 'aaa' });
    await insertPoi('Tofuku-ji', { fsq: 'bbb' });
    await insertPoi('Kiyomizu-dera', { fsq: 'ccc' });

    const report = await runFoursquarePhotoWarmup(
      pool,
      config(),
      { maxCalls: 2, dryRun: true },
      logger,
    );

    expect(report).toMatchObject({ places: 3, calls: 2, dryRun: true, stopped: 'budget' });
    expect(requested).toEqual([]);
    expect(await callsCounted()).toBe(0);
    expect(await photosOf(poi)).toBe(0);
    expect((await pool.query('SELECT 1 FROM poi_foursquare_photo_reads')).rows).toEqual([]);
  });

  it('stops at the budget, must-sees first, and carries on from there on the next run', async () => {
    await insertPoi('Tofuku-ji', { fsq: 'plain-1' });
    const mustSee = await insertPoi('Fushimi Inari Taisha', { fsq: 'must', mustSee: true });
    await insertPoi('Kiyomizu-dera', { fsq: 'plain-2' });

    const first = await runFoursquarePhotoWarmup(pool, config(), { maxCalls: 1 }, logger);
    expect(first).toMatchObject({ places: 3, calls: 1, stopped: 'budget' });
    expect(requested).toEqual(['https://places-api.foursquare.com/places/must?fields=photos']);
    expect(await photosOf(mustSee)).toBe(5);

    const second = await runFoursquarePhotoWarmup(pool, config(), { maxCalls: 5 }, logger);
    expect(second).toMatchObject({ places: 2, calls: 2 });
    expect(second.stopped).toBeUndefined();
    expect(requested).toHaveLength(3);
  });

  it('reads one destination when asked', async () => {
    await insertPoi('Fushimi Inari Taisha', { fsq: 'kyoto-1' });
    await insertPoi('Todai-ji', { fsq: 'nara-1', slug: 'nara' });
    const report = await runFoursquarePhotoWarmup(
      pool,
      config(),
      { maxCalls: 10, destination: 'nara' },
      logger,
    );
    expect(report).toMatchObject({ places: 1, calls: 1 });
    expect(requested).toEqual(['https://places-api.foursquare.com/places/nara-1?fields=photos']);
  });

  it('stops at the shared monthly cap and logs it', async () => {
    await insertPoi('Fushimi Inari Taisha', { fsq: 'aaa' });
    await insertPoi('Tofuku-ji', { fsq: 'bbb' });
    const report = await runFoursquarePhotoWarmup(
      pool,
      config({ monthlyCallCap: 1 }),
      { maxCalls: 10 },
      logger,
    );
    expect(report).toMatchObject({ calls: 1, capLeft: 1, stopped: 'cap' });
    expect(warnings).toContain('foursquare monthly call cap reached: photo warm-up stopped');
    expect(await callsCounted()).toBe(1);
  });

  it('never pays twice for a place without photos, and tries a failed place again', async () => {
    const empty = await insertPoi('Quiet garden', { fsq: 'aaa' });
    const none = config({
      fetch: (input) => {
        requested.push(input);
        return Promise.resolve(Response.json({ photos: [] }));
      },
    });
    expect(await runFoursquarePhotoWarmup(pool, none, { maxCalls: 5 }, logger)).toMatchObject({
      calls: 1,
      placesWithoutPhotos: 1,
    });
    expect(await runFoursquarePhotoWarmup(pool, none, { maxCalls: 5 }, logger)).toMatchObject({
      places: 0,
      calls: 0,
    });
    expect(await photosOf(empty)).toBe(0);

    const failing = await insertPoi('Tofuku-ji', { fsq: 'bbb' });
    const broken = config({ fetch: () => Promise.resolve(new Response('{}', { status: 500 })) });
    expect(await runFoursquarePhotoWarmup(pool, broken, { maxCalls: 5 }, logger)).toMatchObject({
      calls: 1,
      failed: 1,
    });
    expect(await runFoursquarePhotoWarmup(pool, config(), { maxCalls: 5 }, logger)).toMatchObject({
      places: 1,
      placesWithPhotos: 1,
    });
    expect(await photosOf(failing)).toBe(5);
  });

  it('stops when Foursquare refuses calls', async () => {
    await insertPoi('Fushimi Inari Taisha', { fsq: 'aaa' });
    await insertPoi('Tofuku-ji', { fsq: 'bbb' });
    const refusing = config({ fetch: () => Promise.resolve(new Response('{}', { status: 429 })) });
    expect(await runFoursquarePhotoWarmup(pool, refusing, { maxCalls: 5 }, logger)).toMatchObject({
      calls: 1,
      stopped: 'rate_limited',
    });
  });
});
