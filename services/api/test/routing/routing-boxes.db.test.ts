/**
 * `GET /v1/routing/boxes` against a real migrated Postgres: live destinations and those with a
 * trip in planning, pre or in get a box, from `place_bounds`, the geofence or their places, in
 * that order; the answer carries slugs, reasons and boxes and nothing else, with no session.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/app';
import {
  createRoutingBoxesReader,
  registerRoutingBoxesRoute,
  ROUTING_BOXES_CACHE_MS,
  type RoutingBoxes,
} from '../../src/routes/routing-boxes';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let crewId = '';

const box = (minLon: number, minLat: number, maxLon: number, maxLat: number) =>
  `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`;

async function destination(
  slug: string,
  coverage: 'live' | 'guest',
  shape: { placeBounds?: string; geofence?: string } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, place_bounds, geofence)
     VALUES ($1, $1, $2, 'UTC', ST_GeogFromText($3), ST_GeogFromText($4)) RETURNING id`,
    [slug, coverage, shape.placeBounds ?? null, shape.geofence ?? null],
  );
  return rows[0]?.id ?? '';
}

/** A trip being set up, or one cancelled straight after (a trip's first status is always set-up). */
async function trip(destinationId: string, status: 'setup' | 'cancelled'): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2) RETURNING id`,
    [crewId, destinationId],
  );
  if (status === 'cancelled')
    await pool.query("UPDATE trips SET status = 'cancelled' WHERE id = $1", [rows[0]?.id]);
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({
    connectionString: postgres.getConnectionUri(),
    connectionTimeoutMillis: 2000,
  });
  await runMigrations(pool);
  const uid = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [uid]);
  const crew = await pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Crew', $1) RETURNING id",
    [uid],
  );
  crewId = crew.rows[0]?.id ?? '';

  // Live, boxed by its place bounds even though it has a (wider) geofence too.
  await destination('vn-da-lat', 'live', {
    placeBounds: box(108.3632, 11.8675, 108.5119, 12.013),
    geofence: 'MULTIPOLYGON(((108 11, 109 11, 109 13, 108 13, 108 11)))',
  });
  // Live, boxed by its geofence only.
  await destination('iceland', 'live', {
    geofence: 'MULTIPOLYGON(((-22.8 63.7, -19.5 63.7, -19.5 64.85, -22.8 64.85, -22.8 63.7)))',
  });
  // A guest destination with a trip being planned, boxed by its one place.
  const lima = await destination('pe-lima', 'guest');
  await trip(lima, 'setup');
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Plaza', 'other', -12.05, -77.03)`,
    [lima],
  );
  // A guest destination whose only trip was cancelled: not needed.
  const over = await destination('pt-porto', 'guest', { placeBounds: box(-8.7, 41.1, -8.5, 41.2) });
  await trip(over, 'cancelled');
  // A guest destination with a trip being planned but nothing that says where it is.
  await trip(await destination('nowhere', 'guest'), 'setup');
  // A guest destination nobody plans for.
  await destination('mx-tulum', 'guest', { placeBounds: box(-87.5, 20.1, -87.4, 20.3) });
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

/** No session middleware at all: the route must answer without one. */
function publicApp(now?: () => number) {
  const app = new OpenAPIHono<AppEnv>();
  registerRoutingBoxesRoute(app, { pool, ...(now !== undefined ? { now } : {}) });
  return app;
}

describe('GET /v1/routing/boxes', () => {
  it('lists live destinations and those with an active trip, with no session', async () => {
    const response = await publicApp().request('/v1/routing/boxes');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await response.json()) as RoutingBoxes;
    expect(body.boxes.map(({ slug, reason }) => [slug, reason])).toEqual([
      ['iceland', 'live'],
      ['pe-lima', 'active_trip'],
      ['vn-da-lat', 'live'],
    ]);
  });

  it('boxes by place bounds, then the geofence, then the places, a lone place given width', async () => {
    const body = (await (await publicApp().request('/v1/routing/boxes')).json()) as RoutingBoxes;
    const bySlug = new Map(body.boxes.map((entry) => [entry.slug, entry.bbox]));
    expect(bySlug.get('vn-da-lat')).toEqual([108.3632, 11.8675, 108.5119, 12.013]);
    expect(bySlug.get('iceland')).toEqual([-22.8, 63.7, -19.5, 64.85]);
    expect(bySlug.get('pe-lima')).toEqual([-77.031, -12.051, -77.029, -12.049]);
  });

  it('answers slugs, reasons and boxes only', async () => {
    const body = (await (await publicApp().request('/v1/routing/boxes')).json()) as Record<
      string,
      unknown
    >;
    expect(Object.keys(body).sort()).toEqual(['boxes', 'generatedAt']);
    expect(body['generatedAt']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const entry of body['boxes'] as Record<string, unknown>[])
      expect(Object.keys(entry).sort()).toEqual(['bbox', 'reason', 'slug']);
  });
});

describe('createRoutingBoxesReader', () => {
  it('reads the database at most once per window, whoever asks', async () => {
    let clock = 1_000_000;
    let reads = 0;
    const counting = {
      connect: async () => {
        reads += 1;
        return pool.connect();
      },
    } as unknown as pg.Pool;
    const read = createRoutingBoxesReader(counting, () => clock);
    await Promise.all([read(), read(), read()]);
    expect(reads).toBe(1);
    clock += ROUTING_BOXES_CACHE_MS - 1;
    await read();
    expect(reads).toBe(1);
    clock += 1;
    await read();
    expect(reads).toBe(2);
  });
});
