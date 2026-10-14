/**
 * The destinations in use, which the monthly places refresh covers, against real Postgres: a trip
 * in any phase (as its destination or a stop) or a pitch in the last 180 days; a curated
 * destination nobody uses and a country's other destinations are left out.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { usedSlugs } from '../../../src/jobs/places';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let crewId = '';

async function destination(slug: string, coverage: 'live' | 'guest', setId?: string) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz, critter_set_id)
     VALUES ($1, $1, $2, 'UTC', $3) RETURNING id`,
    [slug, coverage, setId ?? null],
  );
  return rows[0]!.id;
}

async function trip(destinationId: string, daysAgo: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id, created_at)
     VALUES ($1, 'setup', $2, now() - make_interval(days => $3)) RETURNING id`,
    [crewId, destinationId, daysAgo],
  );
  return rows[0]!.id;
}

async function pitch(destinationId: string, daysAgo: number): Promise<void> {
  await pool.query(
    `INSERT INTO pitches (crew_id, destination_id, cache_key, created_at)
     VALUES ($1, $2, $3, now() - make_interval(days => $4))`,
    [crewId, destinationId, randomUUID(), daysAgo],
  );
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);

  const uid = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [uid]);
  const crew = await pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Crew', $1) RETURNING id",
    [uid],
  );
  crewId = crew.rows[0]!.id;
  const { rows: release } = await pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('sets', 1, 'wanted-test', 'Test', 'published', 'publish', repeat('0', 64), '{}', 0, $1, now(), now())
     RETURNING id`,
    [uid],
  );
  const { rows: set } = await pool.query<{ id: string }>(
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       hero_critter_key, month_hints, release_id)
     VALUES ('vn', 'Vietnam', 'VN', 1, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'guest', 'cp-1', '[]', $1)
     RETURNING id`,
    [release[0]!.id],
  );

  await destination('iceland', 'live');
  await destination('vn-da-lat', 'guest', set[0]!.id);
  const lima = await trip(await destination('pe-lima', 'guest'), 10);
  await pitch(await destination('ma-marrakech', 'guest'), 100);
  await trip(await destination('pt-porto', 'guest'), 400);
  await pitch(await destination('mx-tulum', 'guest'), 200);
  await destination('jp-osaka', 'guest');
  await pool.query(
    `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
     VALUES ($1, $2, 1, $3, 2)`,
    [lima, crewId, await destination('pe-cusco', 'guest')],
  );
}, 180_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

describe('usedSlugs', () => {
  it('takes destinations with a trip in any phase or a pitch in the last 180 days', async () => {
    // Iceland is curated but unused, Đà Lạt only shares a country, Tulum's pitch is too old.
    expect(await usedSlugs(pool)).toEqual(['ma-marrakech', 'pe-cusco', 'pe-lima', 'pt-porto']);
  });
});
