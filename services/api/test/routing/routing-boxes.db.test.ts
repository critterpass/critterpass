/**
 * `GET /v1/routing/boxes` against a real migrated Postgres: live destinations, day-trip areas with
 * a place box, and the destinations, stops and day areas of a trip in planning, pre or in get a
 * box, from `place_bounds`, the geofence or their places, in that order; the answer carries slugs,
 * reasons and boxes and nothing else, with no session.
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
  coverage: 'live' | 'guest' | 'area',
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
async function trip(destinationId: string, status: 'setup' | 'cancelled'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2) RETURNING id`,
    [crewId, destinationId],
  );
  const tripId = rows[0]?.id ?? '';
  if (status === 'cancelled')
    await pool.query("UPDATE trips SET status = 'cancelled' WHERE id = $1", [tripId]);
  return tripId;
}

async function stops(tripId: string, destinationIds: readonly string[]): Promise<void> {
  for (const [index, destinationId] of destinationIds.entries())
    await pool.query(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       VALUES ($1, $2, $3, $4, 2)`,
      [tripId, crewId, index + 1, destinationId],
    );
}

async function dayArea(tripId: string, areaId: string): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'organiser', 'draft')
     RETURNING id`,
    [tripId],
  );
  await pool.query(
    'INSERT INTO plan_days (version_id, trip_id, day_no, destination_id) VALUES ($1, $2, 2, $3)',
    [rows[0]?.id, tripId, areaId],
  );
}

async function place(destinationId: string, lat: number, lng: number): Promise<void> {
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Place', 'other', $2, $3)`,
    [destinationId, lat, lng],
  );
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
  const limaTrip = await trip(lima, 'setup');
  await place(lima, -12.05, -77.03);
  // Its second stop, a guest city nobody else plans for.
  const cusco = await destination('pe-cusco', 'guest', {
    placeBounds: box(-72.1, -13.6, -71.9, -13.5),
  });
  await stops(limaTrip, [lima, cusco]);
  // A day trip in the organiser's draft to an area known only by its places: needed for the day.
  const aguas = await destination('pe-aguas-calientes', 'area');
  await place(aguas, -13.155, -72.525);
  await dayArea(limaTrip, aguas);
  // An area with a place box and no trip yet: routable before its first trip.
  await destination('vn-my-son', 'area', { placeBounds: box(108.11, 15.76, 108.14, 15.78) });
  // An area with no place box and no trip: nothing to cut.
  const unboxed = await destination('vn-ba-na', 'area');
  await place(unboxed, 15.99, 107.99);
  // A guest destination whose only trip was cancelled: not needed.
  const over = await destination('pt-porto', 'guest', { placeBounds: box(-8.7, 41.1, -8.5, 41.2) });
  const overTrip = await trip(over, 'cancelled');
  // Its second stop goes with it.
  const lisbon = await destination('pt-lisbon', 'guest', {
    placeBounds: box(-9.2, 38.7, -9.1, 38.8),
  });
  await stops(overTrip, [over, lisbon]);
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
  it('lists live destinations, boxed areas and what active trips need, with no session', async () => {
    const response = await publicApp().request('/v1/routing/boxes');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await response.json()) as RoutingBoxes;
    expect(body.boxes.map(({ slug, reason }) => [slug, reason])).toEqual([
      ['iceland', 'live'],
      ['pe-aguas-calientes', 'area'],
      ['pe-cusco', 'active_trip'],
      ['pe-lima', 'active_trip'],
      ['vn-da-lat', 'live'],
      ['vn-my-son', 'area'],
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
