/**
 * `/v1/map/regions/{destination_id}` against real Postgres (Testcontainers) — same harness shape as
 * `routes.db.test.ts` (a minimal stand-in auth middleware, since real session verification does not
 * exist yet).
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
let unmappedDestinationId: string;

const TEST_UID = '00000000-0000-7000-8000-000000000002';
const TILES_BASE_URL = 'https://tiles.test.example';

function buildTestApp() {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('uid', TEST_UID);
    c.set('device', 'test-device');
    await next();
  });
  registerPlacesRoutes(app, { pool, tilesBaseUrl: TILES_BASE_URL });
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

  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('kyoto', 'Kyoto', 'live', 'Asia/Tokyo') RETURNING id",
  );
  destinationId = rows[0]!.id;

  const { rows: otherRows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('cusco', 'Cusco', 'live', 'America/Lima') RETURNING id",
  );
  unmappedDestinationId = otherRows[0]!.id;

  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES
       ($1, 'Nishiki Market', 'market', 35.0051, 135.7651),
       ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727)`,
    [destinationId],
  );

  // Two versions on purpose: the manifest must serve the newest, not whichever inserted first.
  await pool.query(
    `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
     VALUES ($1, 'kyoto/tiles-v1.pmtiles', 4109962, 'v1')`,
    [destinationId],
  );
  await pool.query(
    `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version, created_at)
     VALUES ($1, 'kyoto/tiles-v2.pmtiles', 5200000, 'v2', now() + interval '1 minute')`,
    [destinationId],
  );
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('GET /v1/map/regions/:destination_id', () => {
  it('returns the latest version manifest with a real poi_count', async () => {
    const app = buildTestApp();
    const response = await app.request(`/v1/map/regions/${destinationId}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      url: string;
      bytes: number;
      version: string;
      poiCount: number;
    };
    expect(body).toEqual({
      url: `${TILES_BASE_URL}/kyoto/tiles-v2.pmtiles`,
      bytes: 5200000,
      version: 'v2',
      poiCount: 2,
    });
  });

  it('404s NOT_FOUND for a destination with no uploaded region pack', async () => {
    const app = buildTestApp();
    const response = await app.request(`/v1/map/regions/${unmappedDestinationId}`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects an unauthenticated request', async () => {
    const app = new OpenAPIHono<AppEnv>();
    registerPlacesRoutes(app, { pool, tilesBaseUrl: TILES_BASE_URL });
    app.onError((error, c) => {
      const anyError = error as { http?: number; toResponseBody?: () => unknown };
      if (typeof anyError.toResponseBody === 'function')
        return c.json(anyError.toResponseBody(), anyError.http as never);
      throw error;
    });
    const response = await app.request(`/v1/map/regions/${destinationId}`);
    expect(response.status).toBe(401);
  });
});
