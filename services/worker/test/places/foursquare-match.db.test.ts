/**
 * The curated Foursquare id match against real Postgres (Testcontainers). Foursquare's Place Search
 * is the one network boundary, replaced by a response recorded 2026-10-03 (name "Fushimi Inari
 * Taisha" around the shrine's point); the cap runs through the real `app.reserve_foursquare_call`.
 */
import { readFileSync } from 'node:fs';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { JobLogger } from '../../src/boss/define-job';
import { runFoursquareMatch, type FoursquareMatchConfig } from '../../src/places/foursquare-match';

const recorded: unknown = JSON.parse(
  readFileSync(new URL('../fixtures/foursquare/place-search.json', import.meta.url), 'utf8'),
);

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let destinationId: string;
let requested: string[];
let warnings: string[];

const logger: JobLogger = {
  info: () => undefined,
  warn: (_details, message) => warnings.push(message),
  error: () => undefined,
};

function config(overrides: Partial<FoursquareMatchConfig> = {}): FoursquareMatchConfig {
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

async function insertPoi(name: string, curation: string, sourceIds: object = {}): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation, source_ids)
     VALUES ($1, $2, 'temple_shrine', 34.9671, 135.7727, $3, $4) RETURNING id`,
    [destinationId, name, curation, sourceIds],
  );
  return rows[0]!.id;
}

async function matchOf(poiId: string) {
  const { rows } = await pool.query<{ fsq_place_id: string | null; confidence: number | null }>(
    'SELECT fsq_place_id, confidence FROM poi_foursquare_ids WHERE poi_id = $1',
    [poiId],
  );
  return rows[0];
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('kyoto', 'Kyoto', 'live', 'Asia/Tokyo') RETURNING id",
  );
  destinationId = rows[0]!.id;
}, 180_000);

beforeEach(async () => {
  requested = [];
  warnings = [];
  await pool.query('DELETE FROM poi_foursquare_ids');
  await pool.query('DELETE FROM foursquare_api_usage');
  await pool.query('DELETE FROM pois');
});

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('runFoursquareMatch', () => {
  it('stores the confident match for a curated POI and searches nothing else', async () => {
    const shrine = await insertPoi('Fushimi Inari Taisha', 'editorial');
    await insertPoi('Already linked', 'editorial', { fsq_os: 'abc' });
    await insertPoi('Open data only', 'auto');

    const report = await runFoursquareMatch(pool, config(), { destination: 'kyoto' }, logger);

    expect(report).toMatchObject({ searched: 1, matched: 1, missed: 0, failed: 0 });
    const match = await matchOf(shrine);
    expect(match?.fsq_place_id).toBe('4b6e5cddf964a52034ba2ce3');
    expect(match?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain('fields=fsq_place_id%2Cname%2Cdistance');
    const { rows } = await pool.query('SELECT match_calls FROM foursquare_api_usage');
    expect(rows).toEqual([{ match_calls: 1 }]);
  });

  it('records a miss and does not search it again inside the retry window', async () => {
    const garden = await insertPoi('Quiet moss garden', 'editorial');
    await runFoursquareMatch(pool, config(), {}, logger);
    expect(await matchOf(garden)).toEqual({ fsq_place_id: null, confidence: null });

    const again = await runFoursquareMatch(pool, config(), {}, logger);
    expect(again.searched).toBe(0);
    expect(requested).toHaveLength(1);
  });

  it('stops at the monthly cap and logs it', async () => {
    await insertPoi('Fushimi Inari Taisha', 'editorial');
    await insertPoi('Tofuku-ji', 'editorial');
    const report = await runFoursquareMatch(pool, config({ monthlyCallCap: 1 }), {}, logger);
    expect(report).toMatchObject({ searched: 1, stopped: 'cap' });
    expect(warnings).toContain('foursquare monthly call cap reached: id matching stopped');
  });

  it('stops when Foursquare refuses calls, and skips a POI whose search failed', async () => {
    const first = await insertPoi('Fushimi Inari Taisha', 'editorial');
    await insertPoi('Tofuku-ji', 'editorial');
    const refusing = config({ fetch: () => Promise.resolve(new Response('{}', { status: 429 })) });
    expect(await runFoursquareMatch(pool, refusing, {}, logger)).toMatchObject({
      searched: 1,
      stopped: 'rate_limited',
    });

    const broken = config({ fetch: () => Promise.resolve(new Response('{}', { status: 500 })) });
    expect(await runFoursquareMatch(pool, broken, {}, logger)).toMatchObject({
      searched: 2,
      failed: 2,
    });
    // A failed search is not a miss: the next run tries again.
    expect(await matchOf(first)).toBeUndefined();
  });
});
