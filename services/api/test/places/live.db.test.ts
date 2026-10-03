/**
 * `GET /v1/places/{id}/live` against real Postgres (Testcontainers). Foursquare itself is the one
 * network boundary: it is replaced by a recorded Place Details response (Fushimi Inari Taisha,
 * recorded 2026-10-03), and the monthly cap runs through the real `app.reserve_foursquare_call`.
 */
import { readFileSync } from 'node:fs';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { UNAVAILABLE_PLACE_LIVE, type PlaceLive } from '@cp/domain';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/app';
import type { FoursquareLiveConfig } from '../../src/places/live';
import { registerPlacesRoutes } from '../../src/places/routes';

const recorded: unknown = JSON.parse(
  readFileSync(
    new URL(
      '../../../../packages/domain/test/places/fixtures/foursquare-place-details.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let linkedPoiId: string;
let matchedPoiId: string;
let unlinkedPoiId: string;
let requested: string[];
let capped: string[];
let errors: string[];

function config(overrides: Partial<FoursquareLiveConfig> = {}): FoursquareLiveConfig {
  return {
    apiKey: 'test-key',
    monthlyCallCap: 100,
    fetch: (input) => {
      requested.push(input);
      return Promise.resolve(Response.json(recorded));
    },
    onCapReached: (poiId) => capped.push(poiId),
    onError: (poiId) => errors.push(poiId),
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
  app.onError((error, c) => {
    const anyError = error as { http?: number; toResponseBody?: () => unknown };
    if (typeof anyError.toResponseBody === 'function' && typeof anyError.http === 'number') {
      return c.json(anyError.toResponseBody(), anyError.http as never);
    }
    return c.json({ error: { code: 'INTERNAL', message: String(error), retryable: true } }, 500);
  });
  return app;
}

async function live(app: ReturnType<typeof buildTestApp>, poiId: string): Promise<PlaceLive> {
  const response = await app.request(`/v1/places/${poiId}/live`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  return (await response.json()) as PlaceLive;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows: destinations } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('kyoto', 'Kyoto', 'live', 'Asia/Tokyo') RETURNING id",
  );
  const insert = `INSERT INTO pois (destination_id, name, category, lat, lng, curation, source_ids)
    VALUES ($1, $2, 'temple_shrine', 34.9671, 135.7727, 'editorial', $3) RETURNING id`;
  const destinationId = destinations[0]!.id;
  linkedPoiId = (
    await pool.query<{ id: string }>(insert, [
      destinationId,
      'Fushimi Inari Taisha',
      { fsq_os: '4b6e5cddf964a52034ba2ce3' },
    ])
  ).rows[0]!.id;
  matchedPoiId = (await pool.query<{ id: string }>(insert, [destinationId, 'Tofuku-ji', {}]))
    .rows[0]!.id;
  unlinkedPoiId = (await pool.query<{ id: string }>(insert, [destinationId, 'Quiet garden', {}]))
    .rows[0]!.id;
  await pool.query(
    "INSERT INTO poi_foursquare_ids (poi_id, fsq_place_id, confidence) VALUES ($1, '4b5a1a0ef964a520a0af28e3', 0.9)",
    [matchedPoiId],
  );
}, 180_000);

beforeEach(async () => {
  requested = [];
  capped = [];
  errors = [];
  await pool.query('DELETE FROM foursquare_api_usage');
});

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('GET /v1/places/{id}/live', () => {
  it('passes one Place Details call through, with attribution, and counts it', async () => {
    const body = await live(buildTestApp(config()), linkedPoiId);
    expect(body.available).toBe(true);
    expect(body.rating).toBe(9.5);
    expect(body.attribution).toEqual({ name: 'Foursquare', url: 'https://foursquare.com' });
    expect(requested).toEqual([
      'https://places-api.foursquare.com/places/4b6e5cddf964a52034ba2ce3?fields=date_closed,hours,rating,price,photos,tips,website,tel',
    ]);
    const { rows } = await pool.query('SELECT details_calls FROM foursquare_api_usage');
    expect(rows).toEqual([{ details_calls: 1 }]);
  });

  it('uses the curated match when open data has no Foursquare id', async () => {
    await live(buildTestApp(config()), matchedPoiId);
    expect(requested[0]).toContain('/places/4b5a1a0ef964a520a0af28e3?');
  });

  it('answers unavailable without calling Foursquare when the POI has no id or no key', async () => {
    expect(await live(buildTestApp(config()), unlinkedPoiId)).toEqual(UNAVAILABLE_PLACE_LIVE);
    expect(await live(buildTestApp(), linkedPoiId)).toEqual(UNAVAILABLE_PLACE_LIVE);
    expect(requested).toEqual([]);
  });

  it('stops calling at the monthly cap and logs it', async () => {
    const app = buildTestApp(config({ monthlyCallCap: 1 }));
    expect((await live(app, linkedPoiId)).available).toBe(true);
    expect(await live(app, linkedPoiId)).toEqual(UNAVAILABLE_PLACE_LIVE);
    expect(requested).toHaveLength(1);
    expect(capped).toEqual([linkedPoiId]);
  });

  it('degrades to unavailable when Foursquare errs or is too slow', async () => {
    const failing = config({ fetch: () => Promise.resolve(new Response('nope', { status: 500 })) });
    expect(await live(buildTestApp(failing), linkedPoiId)).toEqual(UNAVAILABLE_PLACE_LIVE);
    const slow = config({
      timeoutMs: 50,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    });
    expect(await live(buildTestApp(slow), linkedPoiId)).toEqual(UNAVAILABLE_PLACE_LIVE);
    expect(errors).toEqual([linkedPoiId, linkedPoiId]);
  });

  it('is 404 for a POI that does not exist', async () => {
    const response = await buildTestApp(config()).request(
      '/v1/places/00000000-0000-7000-8000-00000000abcd/live',
    );
    expect(response.status).toBe(404);
  });
});
