/**
 * Live Foursquare search and the pick that makes a result storable, against real Postgres
 * (Testcontainers) and a real pg-boss producer. Foursquare is the one network boundary: Place
 * Search answers with a recorded response (Bali waterfalls, recorded 2026-10-03), and the monthly
 * cap runs through the real `app.reserve_foursquare_call`.
 */
import { readFileSync } from 'node:fs';

import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/app';
import { startJobProducer } from '../../src/jobs/producer';
import type { FoursquareLiveConfig } from '../../src/places/live';
import type { PlaceLiveSearch } from '../../src/places/live-search';
import { queueIngestWhenSparse } from '../../src/places/on-demand-ingest';
import { registerPlacesRoutes } from '../../src/places/routes';

const recordedSearch: unknown = JSON.parse(
  readFileSync(new URL('./fixtures/foursquare-place-search.json', import.meta.url), 'utf8'),
);
const TIBUMANA = { name: 'Tibumana Waterfall', latitude: -8.507279, longitude: 115.331979 };

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let producer: PgBoss;
let bali: string;
let hoiAn: string;
let linkedPoiId: string;
let overturePoiId: string;
let requested: string[];
let capped: string[];

function config(overrides: Partial<FoursquareLiveConfig> = {}): FoursquareLiveConfig {
  return {
    apiKey: 'test-key',
    monthlyCallCap: 100,
    fetch: (input) => {
      requested.push(input);
      const body = input.includes('/places/search?') ? recordedSearch : TIBUMANA;
      return Promise.resolve(Response.json(body));
    },
    onCapReached: (label) => capped.push(label),
    ...overrides,
  };
}

function buildTestApp(foursquare?: FoursquareLiveConfig) {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('uid', '00000000-0000-7000-8000-000000000001');
    c.set('device', 'test-device');
    await next();
  });
  registerPlacesRoutes(app, { pool, ...(foursquare === undefined ? {} : { foursquare }) });
  return app;
}

async function get<T>(app: ReturnType<typeof buildTestApp>, path: string): Promise<T> {
  const response = await app.request(path);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return (await response.json()) as T;
}

async function ingestJobs(): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(
    "SELECT data FROM pgboss.job WHERE name = 'places.ingest' ORDER BY created_on",
  );
  return rows.map((row) => row.data);
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  producer = await startJobProducer({
    connectionString: postgres.getConnectionUri(),
    logger: { error: () => undefined },
  });
  const destination = async (slug: string, name: string, bounds: string | null) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, country, coverage, tz, place_bounds)
         VALUES ($1, $2, $3, 'guest', 'Asia/Makassar', $4::geography) RETURNING id`,
        [slug, name, slug === 'bali' ? 'Indonesia' : 'Vietnam', bounds],
      )
    ).rows[0]!.id;
  bali = await destination(
    'bali',
    'Bali',
    'SRID=4326;POLYGON((114.4 -8.9,115.75 -8.9,115.75 -8.05,114.4 -8.05,114.4 -8.9))',
  );
  hoiAn = await destination('vn-hoi-an', 'Hội An', null);
  const insert = `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
    VALUES ($1, $2, 'nature', $3, $4, $5) RETURNING id`;
  linkedPoiId = (
    await pool.query<{ id: string }>(insert, [
      bali,
      'Tukad Cepung',
      -8.441,
      115.3877,
      { fsq_os: '5688c451498e3181bd093eeb' },
    ])
  ).rows[0]!.id;
  // Overture's copy of Tibumana, 40 m from Foursquare's point, under its Indonesian name too.
  overturePoiId = (
    await pool.query<{ id: string }>(insert, [
      bali,
      'Air Terjun Tibumana',
      -8.5076,
      115.3321,
      { overture: '08f8c' },
    ])
  ).rows[0]!.id;
  await pool.query("UPDATE pois SET name_local = 'Tibumana Waterfall' WHERE id = $1", [
    overturePoiId,
  ]);
}, 240_000);

beforeEach(async () => {
  requested = [];
  capped = [];
  await pool.query('DELETE FROM foursquare_api_usage');
});

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await pool?.end();
  await postgres?.stop();
});

describe('GET /v1/places/search/live', () => {
  it('searches Foursquare when our results are few, marks the places we hold, and counts it', async () => {
    const body = await get<PlaceLiveSearch>(
      buildTestApp(config()),
      `/v1/places/search/live?q=waterfall&destination_id=${bali}`,
    );
    expect(requested).toHaveLength(1);
    const url = new URL(requested[0]!);
    expect(url.pathname).toBe('/places/search');
    expect(url.searchParams.get('fields')).toBe(
      'fsq_place_id,name,latitude,longitude,categories,location,distance',
    );
    expect(url.searchParams.get('ll')).toMatch(/^-8\.47\d*,115\.07\d*$/);
    expect(body.attribution).toEqual({ name: 'Foursquare', url: 'https://foursquare.com' });
    // Our search shows Tibumana (its local name says waterfall); Foursquare adds the other two,
    // Tukad Cepung with our POI id because open data links it.
    expect(body.results.map((place) => [place.name, place.poiId])).toEqual([
      ['Tukad Cepung Waterfall', linkedPoiId],
      ['Tibumana Waterfall', null],
      ['Kanto Lampo Waterfall', null],
    ]);
    const { rows } = await pool.query('SELECT search_calls FROM foursquare_api_usage');
    expect(rows).toEqual([{ search_calls: 1 }]);
  });

  it('keeps a place our own results already show out of the live section', async () => {
    const body = await get<PlaceLiveSearch>(
      buildTestApp(config()),
      `/v1/places/search/live?q=tukad&destination_id=${bali}`,
    );
    expect(body.results.map((place) => place.name)).toEqual([
      'Tibumana Waterfall',
      'Kanto Lampo Waterfall',
    ]);
  });

  it('asks Foursquare near the place name when the destination has no box', async () => {
    await get(buildTestApp(config()), `/v1/places/search/live?q=lantern&destination_id=${hoiAn}`);
    expect(new URL(requested[0]!).searchParams.get('near')).toBe('Hội An, Vietnam');
  });

  it('calls nothing for short queries, without a key, or past the monthly cap', async () => {
    const empty = { results: [], attribution: null };
    expect(
      await get(buildTestApp(config()), `/v1/places/search/live?q=wa&destination_id=${bali}`),
    ).toEqual(empty);
    expect(
      await get(buildTestApp(), `/v1/places/search/live?q=waterfall&destination_id=${bali}`),
    ).toEqual(empty);
    expect(requested).toEqual([]);
    const app = buildTestApp(config({ monthlyCallCap: 1 }));
    await get(app, `/v1/places/search/live?q=waterfall&destination_id=${bali}`);
    expect(await get(app, `/v1/places/search/live?q=waterfall&destination_id=${bali}`)).toEqual(
      empty,
    );
    expect(requested).toHaveLength(1);
    expect(capped).toHaveLength(1);
  });
});

describe('GET /v1/places/search/live/resolve', () => {
  const resolve = (fsqPlaceId: string, destinationId: string, foursquare = config()) =>
    get<{ status: string; poiId?: string; name?: string }>(
      buildTestApp(foursquare),
      `/v1/places/search/live/resolve?fsq_place_id=${fsqPlaceId}&destination_id=${destinationId}`,
    );

  it('answers with the open-data POI that shares the id, without calling Foursquare', async () => {
    expect(await resolve('5688c451498e3181bd093eeb', bali)).toEqual({
      status: 'ready',
      poiId: linkedPoiId,
      name: 'Tukad Cepung',
    });
    expect(requested).toEqual([]);
  });

  it('matches the same place in open data and keeps only the id', async () => {
    expect(await resolve('55b47f4b498e095b065c6e60', bali)).toEqual({
      status: 'ready',
      poiId: overturePoiId,
      name: 'Air Terjun Tibumana',
    });
    expect(requested[0]).toContain(
      '/places/55b47f4b498e095b065c6e60?fields=name,latitude,longitude',
    );
    const links = await withSystem(
      pool,
      async (tx) => (await tx.query('SELECT poi_id, fsq_place_id FROM poi_foursquare_ids')).rows,
    );
    expect(links).toEqual([{ poi_id: overturePoiId, fsq_place_id: '55b47f4b498e095b065c6e60' }]);
    // The second pick finds the link and calls nothing.
    requested = [];
    expect((await resolve('55b47f4b498e095b065c6e60', bali)).poiId).toBe(overturePoiId);
    expect(requested).toEqual([]);
  });

  it('queues the ingest of a sparse destination once, and says not yet', async () => {
    const elsewhere = config({
      fetch: () =>
        Promise.resolve(Response.json({ ...TIBUMANA, latitude: 15.88, longitude: 108.33 })),
    });
    expect(await resolve('4c1b5b0ba9e3c9b6a1d1a111', hoiAn, elsewhere)).toEqual({
      status: 'loading',
    });
    expect(await resolve('4c1b5b0ba9e3c9b6a1d1a112', hoiAn, elsewhere)).toEqual({
      status: 'loading',
    });
    expect(await ingestJobs()).toEqual([{ slug: 'vn-hoi-an' }]);
  });

  it('cannot save a place open data does not have in a destination already covered', async () => {
    await withSystem(pool, (tx) =>
      tx.query(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         SELECT $1, 'Place ' || n, 'other', -8.6, 115.2 FROM generate_series(1, 50) AS n`,
        [bali],
      ),
    );
    const far = config({
      fetch: () =>
        Promise.resolve(Response.json({ ...TIBUMANA, latitude: -8.3, longitude: 115.0 })),
    });
    expect(await resolve('4c1b5b0ba9e3c9b6a1d1a113', bali, far)).toEqual({ status: 'unavailable' });
    expect(await withSystem(pool, (tx) => queueIngestWhenSparse(tx, bali))).toBe(false);
  });
});
