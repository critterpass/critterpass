/**
 * `/v1/places/search` and `/v1/places/{id}` against real Postgres (Testcontainers). Auth
 * verification middleware does not exist yet, so this harness adds its own minimal stand-in that
 * sets `c.var.uid`/`c.var.device` before the places routes — the same shape `AppEnv`/`AuthVariables`
 * in `../../src/app.ts` document for whichever middleware lands later.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/app';
import { registerPlacesRoutes } from '../../src/places/routes';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;
let poiId: string;
let noHoursPoiId: string;

const TEST_UID = '00000000-0000-7000-8000-000000000001';

function buildTestApp() {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('uid', TEST_UID);
    c.set('device', 'test-device');
    await next();
  });
  registerPlacesRoutes(app, { pool });
  app.onError((error, c) => {
    const anyError = error as { http?: number; toResponseBody?: () => unknown };
    if (typeof anyError.toResponseBody === 'function' && typeof anyError.http === 'number') {
      return c.json(anyError.toResponseBody(), anyError.http as never);
    }
    return c.json({ error: { code: 'INTERNAL', message: String(error), retryable: true } }, 500);
  });
  return app;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  await runMigrations(pool);

  const { rows: destinationRows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('kyoto', 'Kyoto', 'live', 'Asia/Tokyo') RETURNING id",
  );
  destinationId = destinationRows[0]!.id;

  const { rows: poiRows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, address, hours, hours_verified_at, price_level, tags)
     VALUES ($1, 'Nishiki Market', 'market', 35.0051, 135.7651, 'Nakagyo Ward',
             '{"weekly": {"mo": [{"start": "09:00", "end": "18:00"}]}}'::jsonb,
             now(), 2, ARRAY['food', 'shopping'])
     RETURNING id`,
    [destinationId],
  );
  poiId = poiRows[0]!.id;
  await pool.query(
    'INSERT INTO poi_live_checks (poi_id, is_open_now, checked_at) VALUES ($1, true, now())',
    [poiId],
  );
  const { rows: noHoursRows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727)
     RETURNING id`,
    [destinationId],
  );
  noHoursPoiId = noHoursRows[0]!.id;
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('GET /v1/places/search', () => {
  it('finds a POI by text query', async () => {
    const app = buildTestApp();
    const response = await app.request('/v1/places/search?q=Nishiki');
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { name: string }[] };
    expect(body.results.map((r) => r.name)).toContain('Nishiki Market');
  });

  it('filters by category', async () => {
    const app = buildTestApp();
    const response = await app.request(
      `/v1/places/search?destination_id=${destinationId}&category=temple_shrine`,
    );
    const body = (await response.json()) as { results: { name: string; category: string }[] };
    expect(body.results).toEqual([
      expect.objectContaining({ name: 'Fushimi Inari Taisha', category: 'temple_shrine' }),
    ]);
  });

  it('ranks by distance when near is given', async () => {
    const app = buildTestApp();
    const response = await app.request(
      `/v1/places/search?near=35.0052,135.7652&destination_id=${destinationId}`,
    );
    const body = (await response.json()) as {
      results: { name: string; distanceM: number | null }[];
    };
    expect(body.results[0]?.name).toBe('Nishiki Market');
    expect(body.results[0]?.distanceM).toBeLessThan(100);
  });

  it('lists curated places before other matches and hides records merged into another', async () => {
    const insert = `INSERT INTO pois (destination_id, name, category, lat, lng, curation, merged_into_id)
      VALUES ($1, $2, $3, 35.0, 135.76, $4, $5) RETURNING id`;
    const street = await pool.query<{ id: string }>(insert, [
      destinationId,
      'Kamo River Kamo River Guesthouse',
      'stay',
      'auto',
      null,
    ]);
    const river = await pool.query<{ id: string }>(insert, [
      destinationId,
      'Kamo River',
      'nature',
      'editorial',
      null,
    ]);
    await pool.query(insert, [destinationId, 'Kamo River', 'other', 'auto', river.rows[0]!.id]);
    const app = buildTestApp();
    const response = await app.request(
      `/v1/places/search?q=${encodeURIComponent('Kamo River')}&destination_id=${destinationId}`,
    );
    const body = (await response.json()) as { results: { id: string; name: string }[] };
    expect(body.results.map((r) => r.id)).toEqual([river.rows[0]!.id, street.rows[0]!.id]);
  });

  it('ranks a place named after the query above curated places that only share its address', async () => {
    const insert = `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, address, curation)
      VALUES ($1, $2, $3, $4, 35.0, 135.76, $5, $6) RETURNING id`;
    const bar = await pool.query<{ id: string }>(insert, [
      destinationId,
      'Billabong Bar',
      null,
      'nightlife',
      'Mỹ An, Sơn Trà',
      'editorial',
    ]);
    const sanctuary = await pool.query<{ id: string }>(insert, [
      destinationId,
      'Di sản Văn hóa Thế Giới Mỹ Sơn',
      'Thánh địa Mỹ Sơn',
      'other',
      'Duy Phú, Duy Xuyên',
      'auto',
    ]);
    const app = buildTestApp();
    const response = await app.request(
      `/v1/places/search?q=${encodeURIComponent('My Son')}&destination_id=${destinationId}`,
    );
    const body = (await response.json()) as { results: { id: string }[] };
    const ids = body.results.map((r) => r.id);
    expect(ids[0]).toBe(sanctuary.rows[0]!.id);
    expect(ids.indexOf(bar.rows[0]!.id)).toBeGreaterThan(0);
  });

  it('rejects an unauthenticated request', async () => {
    const app = new OpenAPIHono<AppEnv>();
    registerPlacesRoutes(app, { pool });
    app.onError((error, c) => {
      const anyError = error as { http?: number; toResponseBody?: () => unknown };
      if (typeof anyError.toResponseBody === 'function')
        return c.json(anyError.toResponseBody(), anyError.http as never);
      throw error;
    });
    const response = await app.request('/v1/places/search?q=Nishiki');
    expect(response.status).toBe(401);
  });
});

describe('GET /v1/places/:id', () => {
  it('returns hours evaluation and live-check flags for a known POI', async () => {
    const app = buildTestApp();
    const response = await app.request(`/v1/places/${poiId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      name: string;
      liveIsOpenNow: boolean;
      hoursVerifiedAt: string;
    };
    expect(body.name).toBe('Nishiki Market');
    expect(body.liveIsOpenNow).toBe(true);
    expect(body.hoursVerifiedAt).not.toBeNull();
  });

  it('answers for a POI with no stored hours, with opening state unknown', async () => {
    const app = buildTestApp();
    const response = await app.request(`/v1/places/${noHoursPoiId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { openNow: boolean | null; nextOpenAt: string | null };
    expect(body.openNow).toBeNull();
    expect(body.nextOpenAt).toBeNull();
  });

  it('returns 404 NOT_FOUND for an unknown POI', async () => {
    const app = buildTestApp();
    const response = await app.request('/v1/places/00000000-0000-7000-8000-0000000000ff');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
