/**
 * `placesSearchTool`/`placeDetailsTool` against real Postgres (Testcontainers), run as `guide_reader`
 * through `llm.pois` — never `public.pois` directly (see `../../src/places/tool-executors.ts`).
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { placeDetailsTool, placesSearchTool } from '../../src/places/tool-executors';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;
let nishikiId: string;
let fushimiId: string;

const TRIP_ID = '00000000-0000-7000-8000-000000000010';

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

  const dailyHours = {
    weekly: Object.fromEntries(
      ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
        day,
        [{ start: '09:00', end: '18:00' }],
      ]),
    ),
  };
  const { rows: nishikiRows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, price_level, tags, hours, hours_verified_at)
     VALUES ($1, 'Nishiki Market', 'market', 35.0051, 135.7651, 2, ARRAY['food'], $2::jsonb, now())
     RETURNING id`,
    [destinationId, JSON.stringify(dailyHours)],
  );
  nishikiId = nishikiRows[0]!.id;
  await pool.query('INSERT INTO poi_live_checks (poi_id, is_open_now) VALUES ($1, true)', [
    nishikiId,
  ]);

  const { rows: fushimiRows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Fushimi Inari Taisha', 'temple_shrine', 34.9671, 135.7727) RETURNING id`,
    [destinationId],
  );
  fushimiId = fushimiRows[0]!.id;
}, 180_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

describe('placesSearchTool', () => {
  it('finds a POI by name and returns only fields the tool contract promises', async () => {
    const results = await placesSearchTool(pool, TRIP_ID, TRIP_ID, { query: 'Nishiki' });
    expect(results).toEqual([
      expect.objectContaining({
        poi_id: nishikiId,
        name: 'Nishiki Market',
        open_now: true,
        price_level: 2,
      }),
    ]);
  });

  it('filters by category', async () => {
    const results = await placesSearchTool(pool, TRIP_ID, TRIP_ID, { category: 'temple_shrine' });
    expect(results.map((r) => r.poi_id)).toEqual([fushimiId]);
  });

  it('resolves "near" from a place_id when no explicit coordinates are given', async () => {
    const results = await placesSearchTool(pool, TRIP_ID, TRIP_ID, { place_id: nishikiId });
    expect(results[0]?.poi_id).toBe(nishikiId);
    expect(results[0]?.distance_m).toBe(0);
  });

  it('excludes a POI closed at the requested open_at instant', async () => {
    // 2026-09-30T23:00:00Z = 08:00 JST Wednesday: before Nishiki's 09:00 open.
    const results = await placesSearchTool(pool, TRIP_ID, TRIP_ID, {
      query: 'Nishiki',
      open_at: '2026-09-30T23:00:00Z',
    });
    expect(results).toEqual([]);
  });

  it('includes a POI open at the requested open_at instant', async () => {
    // 2026-09-30T05:00:00Z = 14:00 JST Wednesday: within Nishiki's 09:00-18:00.
    const results = await placesSearchTool(pool, TRIP_ID, TRIP_ID, {
      query: 'Nishiki',
      open_at: '2026-09-30T05:00:00Z',
    });
    expect(results.map((r) => r.poi_id)).toEqual([nishikiId]);
  });
});

describe('placeDetailsTool', () => {
  it('quotes hours only when hours_verified_at is set', async () => {
    const result = await placeDetailsTool(pool, TRIP_ID, TRIP_ID, { poi_id: nishikiId });
    expect(result.verified_at).not.toBeNull();
    // jsonb does not preserve key insertion order, so compare as a day -> spans map, not an array.
    expect(Object.fromEntries(result.hours.map((entry) => [entry.day, entry.spans]))).toEqual(
      Object.fromEntries(
        ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((day) => [
          day,
          [{ start: '09:00', end: '18:00' }],
        ]),
      ),
    );
  });

  it('never quotes hours for a POI with unverified hours, even if hours jsonb is set', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, hours)
       VALUES ($1, 'Unverified Cafe', 'food', 35.0, 135.76,
               '{"weekly": {"mo": [{"start": "08:00", "end": "20:00"}]}}'::jsonb)
       RETURNING id`,
      [destinationId],
    );
    const result = await placeDetailsTool(pool, TRIP_ID, TRIP_ID, { poi_id: rows[0]!.id });
    expect(result.verified_at).toBeNull();
    expect(result.hours).toEqual([]);
  });

  it('returns an empty/unknown shape for an unknown POI rather than throwing', async () => {
    const result = await placeDetailsTool(pool, TRIP_ID, TRIP_ID, {
      poi_id: '00000000-0000-7000-8000-0000000000ff',
    });
    expect(result).toEqual({ hours: [], price_level: null, indoor: null, verified_at: null });
  });
});
