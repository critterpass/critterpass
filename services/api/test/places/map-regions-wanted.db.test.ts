/**
 * `GET /v1/map/regions/wanted` against a real migrated Postgres: which destinations are waiting
 * for a region pack, in which order, and that the answer carries slugs and boxes and nothing else.
 * A trip asks for its destination, its stops and its days' areas.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppEnv } from '../../src/app';
import {
  createWantedRegionsReader,
  WANTED_CACHE_MS,
  widenToDayTrips,
} from '../../src/places/map-regions-wanted';
import { registerPlacesRoutes } from '../../src/places/routes';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let crewId = '';

const DA_LAT_BOX =
  'POLYGON((108.3632 11.8675, 108.5119 11.8675, 108.5119 12.013, 108.3632 12.013, 108.3632 11.8675))';
const BANGKOK_BOX =
  'POLYGON((100.3548 13.6177, 100.6322 13.6177, 100.6322 13.8872, 100.3548 13.8872, 100.3548 13.6177))';

async function destination(
  slug: string,
  box: string | null,
  coverage: 'guest' | 'area' = 'guest',
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, place_bounds)
     VALUES ($1, $1, $3, 'UTC', ST_GeogFromText($2)) RETURNING id`,
    [slug, box, coverage],
  );
  return rows[0]?.id ?? '';
}

async function trip(destinationId: string, daysAgo: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, created_at)
     VALUES ($1, 'setup', $2, now() - make_interval(days => $3)) RETURNING id`,
    [crewId, destinationId, daysAgo],
  );
  return rows[0]?.id ?? '';
}

async function pack(destinationId: string, slug: string): Promise<void> {
  await pool.query(
    `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
     VALUES ($1, $2, 1000, 'v1')`,
    [destinationId, `${slug}/tiles-v1.pmtiles`],
  );
}

/** A trip to a city with a pack, a second stop and a day trip in an area, neither with a pack. */
async function tripWithStopAndDayArea(daysAgo: number): Promise<void> {
  const city = await destination('wanted-hue', DA_LAT_BOX);
  await pack(city, 'wanted-hue');
  const tripId = await trip(city, daysAgo);
  const stop = await destination('wanted-hoi-an', DA_LAT_BOX);
  await pool.query(
    `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
     VALUES ($1, $2, 1, $3, 2), ($1, $2, 2, $4, 2)`,
    [tripId, crewId, city, stop],
  );
  const area = await destination('wanted-my-son', DA_LAT_BOX, 'area');
  const version = await pool.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [tripId],
  );
  await pool.query(
    'INSERT INTO plan_days (version_id, trip_id, day_no, destination_id) VALUES ($1, $2, 3, $3)',
    [version.rows[0]?.id, tripId, area],
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

  // Asked for 3 days ago, no pack.
  await trip(await destination('wanted-bangkok', BANGKOK_BOX), 3);
  // Asked for 10 days ago (and again yesterday), no pack: the oldest request, so it comes first.
  const daLat = await destination('wanted-da-lat', DA_LAT_BOX);
  await trip(daLat, 10);
  await trip(daLat, 1);
  // Has a pack already.
  const packed = await destination('wanted-has-pack', DA_LAT_BOX);
  await trip(packed, 2);
  await pack(packed, 'wanted-has-pack');
  // Nobody has asked in the window.
  await trip(await destination('wanted-long-ago', DA_LAT_BOX), 45);
  // Asked for, but nothing says where it is yet.
  await trip(await destination('wanted-no-box', null), 4);
  // Asked for through a pitch, not a trip.
  const pitched = await destination('wanted-pitched', BANGKOK_BOX);
  await pool.query(
    `INSERT INTO pitches (crew_id, destination_id, cache_key, created_at)
     VALUES ($1, $2, 'wanted-pitched', now() - interval '2 days')`,
    [crewId, pitched],
  );
  // Asked for 5 days ago: the city has a pack, its second stop and its day area do not.
  await tripWithStopAndDayArea(5);
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

/** No session middleware at all: the route must answer without one. */
function publicApp() {
  const app = new OpenAPIHono<AppEnv>();
  registerPlacesRoutes(app, { pool });
  return app;
}

describe('GET /v1/map/regions/wanted', () => {
  it('lists destinations asked for and without a pack, oldest request first, with no session', async () => {
    const response = await publicApp().request('/v1/map/regions/wanted?limit=10');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    const body = (await response.json()) as { regions: { slug: string; bounds: number[] }[] };
    // One-stop trips add only their destination; the packed city's stop and day area join in.
    expect(body.regions.map((region) => region.slug)).toEqual([
      'wanted-da-lat',
      'wanted-hoi-an',
      'wanted-my-son',
      'wanted-bangkok',
      'wanted-pitched',
    ]);
  });

  it('answers slugs and boxes only, the box widened to the day trips', async () => {
    const response = await publicApp().request('/v1/map/regions/wanted');
    const body = (await response.json()) as { regions: Record<string, unknown>[] };
    expect(Object.keys(body)).toEqual(['regions']);
    for (const region of body.regions)
      expect(Object.keys(region).sort()).toEqual(['bounds', 'slug']);
    const daLat = body.regions.find((region) => region['slug'] === 'wanted-da-lat');
    // 30 km is about 0.27° of latitude and, at 12° north, 0.2755° of longitude.
    expect(daLat?.['bounds']).toEqual([108.0877, 11.598, 108.7874, 12.2825]);
  });

  it('keeps to the limit it is given', async () => {
    const response = await publicApp().request('/v1/map/regions/wanted?limit=1');
    const body = (await response.json()) as { regions: { slug: string }[] };
    expect(body.regions.map((region) => region.slug)).toEqual(['wanted-da-lat']);
  });
});

describe('createWantedRegionsReader', () => {
  it('reads the database at most once per window, whoever asks', async () => {
    let clock = 1_000_000;
    let reads = 0;
    const counting = {
      connect: async () => {
        reads += 1;
        return pool.connect();
      },
    } as unknown as pg.Pool;
    const read = createWantedRegionsReader(counting, () => clock);
    await Promise.all([read(), read(), read()]);
    clock += WANTED_CACHE_MS - 1;
    await read();
    expect(reads).toBe(1);
    clock += 2;
    await read();
    expect(reads).toBe(2);
  });
});

describe('widenToDayTrips', () => {
  it('never leaves the globe', () => {
    const box = widenToDayTrips({ min_lon: 179.9, min_lat: 84.9, max_lon: 179.95, max_lat: 84.95 });
    expect(box[2]).toBe(180);
    expect(box[3]).toBe(85);
  });
});
