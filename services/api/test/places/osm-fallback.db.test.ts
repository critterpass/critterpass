/**
 * The place search's OpenStreetMap fallback against real Postgres and Redis (Testcontainers):
 * a submitted search inside a destination that finds nothing asks Nominatim once (bounded to the
 * place box), stores the one accepted place as an OSM row and answers with it; the next search
 * finds it in our index without asking again. A search while typing never asks, a miss is kept,
 * and a second request in the same second gets no fallback. Nominatim is the one network boundary
 * (its jsonv2 reply from `@cp/planner`'s test fixture).
 */
import { runMigrations } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PATONG_BEACH_REPLY } from '../../../../packages/planner/test/draft/nominatim-fixture';
import type { AppEnv } from '../../src/app';
import type { OsmFallbackDeps } from '../../src/places/osm-fallback';
import { registerPlacesRoutes } from '../../src/places/routes';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let phuket: string;
let asked: string[];
let clock: number;

function buildApp(over: Partial<OsmFallbackDeps> = {}) {
  const app = new OpenAPIHono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('uid', '00000000-0000-7000-8000-000000000001');
    c.set('device', 'test-device');
    await next();
  });
  registerPlacesRoutes(app, {
    pool,
    osmFallback: {
      redis,
      isOn: () => Promise.resolve(true),
      // Two seconds between requests, so the one-a-second bucket never trips by accident.
      now: () => new Date((clock += 2_000)),
      fetcher: ((url: string) => {
        asked.push(url);
        return Promise.resolve(Response.json(PATONG_BEACH_REPLY));
      }) as typeof fetch,
      ...over,
    },
  });
  return app;
}

async function search(app: OpenAPIHono<AppEnv>, q: string, submit = true) {
  const params = new URLSearchParams({
    q,
    destination_id: phuket,
    ...(submit ? { submit: '1' } : {}),
  });
  const response = await app.request(`/v1/places/search?${params.toString()}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { results: { name: string; address: string | null }[] })
    .results;
}

const osmRows = async () =>
  (
    await pool.query<{ name: string; address: string | null; lat: number }>(
      `SELECT name, address, lat FROM pois WHERE source_ids ? 'osm'`,
    )
  ).rows;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz, place_bounds)
     VALUES ('th-phuket', 'Phuket', 'Thailand', 'guest', 'Asia/Bangkok',
             'POLYGON((98.2 7.7, 98.5 7.7, 98.5 8.2, 98.2 8.2, 98.2 7.7))'::geography)
     RETURNING id`,
  );
  phuket = rows[0]!.id;
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Big Buddha', 'temple_shrine', 7.8277, 98.3128)`,
    [phuket],
  );
}, 240_000);

beforeEach(() => {
  asked = [];
  clock = Date.UTC(2026, 9, 14, 12);
});

afterAll(async () => {
  await redis?.quit();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

describe('the place search OpenStreetMap fallback', () => {
  it('stores the one accepted place and answers with it, then finds it in our index', async () => {
    const app = buildApp();
    const first = await search(app, 'Patong Beach');
    expect(first.map((r) => [r.name, r.address])).toEqual([
      ['Patong Beach', 'Thawewong Road, Patong, Kathu District'],
    ]);
    expect(asked).toHaveLength(1);
    expect(new URL(asked[0]!).searchParams.get('viewbox')).toBe('98.2000,8.2000,98.5000,7.7000');
    expect(await osmRows()).toEqual([
      { name: 'Patong Beach', address: 'Thawewong Road, Patong, Kathu District', lat: 7.8935 },
    ]);
    const again = await search(app, 'Patong Beach');
    expect(again.map((r) => r.name)).toEqual(['Patong Beach']);
    expect(asked).toHaveLength(1);
    expect(await osmRows()).toHaveLength(1);
  });

  it('never asks while typing, and keeps a miss', async () => {
    const app = buildApp();
    expect(await search(app, 'Karon Viewpoint', false)).toEqual([]);
    expect(asked).toEqual([]);
    expect(await search(app, 'Karon Viewpoint')).toEqual([]);
    expect(await search(app, 'karon  viewpoint')).toEqual([]);
    expect(asked).toHaveLength(1);
  });

  it('gives no fallback to a second request in the same second, or when switched off', async () => {
    const sameSecond = buildApp({ now: () => new Date(clock) });
    await search(sameSecond, 'Kata Noi Beach');
    await search(sameSecond, 'Freedom Beach');
    expect(asked).toHaveLength(1);
    const off = buildApp({ isOn: () => Promise.resolve(false) });
    await search(off, 'Promthep Cape');
    expect(asked).toHaveLength(1);
  });
});
