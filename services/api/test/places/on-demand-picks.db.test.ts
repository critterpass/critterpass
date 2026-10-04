/**
 * A trip set to a destination queues what that destination lacks, against real Postgres and a
 * real pg-boss producer: its open-data ingest when it has almost no places, its machine picks
 * when it has places but neither a curated set nor picks, and nothing when it has either.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import { onDemandIngestHook, queuePickWhenNeeded } from '../../src/places/on-demand-ingest';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let producer: PgBoss;
let owner: string;

async function destination(slug: string, places: number, curation = 'auto'): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ($1, $1, 'Vietnam', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
    [slug],
  );
  const id = rows[0]?.id as string;
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
     SELECT $1, 'Place ' || n, 'food', 11.9 + n * 0.004, 108.44, $3 FROM generate_series(1, $2) AS n`,
    [id, places, curation],
  );
  return id;
}

async function tripTo(destinationId: string): Promise<string> {
  const crew = await pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Crew', $1) RETURNING id",
    [owner],
  );
  const trip = await pool.query<{ id: string }>(
    `INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2) RETURNING id`,
    [crew.rows[0]?.id, destinationId],
  );
  return trip.rows[0]?.id as string;
}

async function jobs(queue: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [queue],
  );
  return rows.map((row) => row.data);
}

const destinationSet = (tripId: string) =>
  withSystem(pool, (tx) =>
    onDemandIngestHook(tx, {
      id: randomUUID(),
      type: 'trip.destination_set',
      tripId,
      crewId: null,
    }),
  );

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri() });
  await runMigrations(pool);
  producer = await startJobProducer({
    connectionString: postgres.getConnectionUri(),
    logger: { error: () => undefined },
  });
  owner = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await pool?.end();
  await postgres?.stop();
});

describe('a trip set to a destination', () => {
  it('queues the picks of one with places but nothing recommended, once', async () => {
    const daLat = await destination('vn-da-lat', 60);
    await destinationSet(await tripTo(daLat));
    expect(await jobs('places.pick')).toEqual([{ destination: 'vn-da-lat' }]);
    expect(await jobs('places.ingest')).toEqual([]);
    // A second trip while that run waits adds nothing.
    await destinationSet(await tripTo(daLat));
    expect(await jobs('places.pick')).toHaveLength(1);

    // Once it has picks there is nothing to queue.
    await pool.query(
      `UPDATE pois SET pick_rank = 1, pick_source = 'fill'
        WHERE id = (SELECT id FROM pois WHERE destination_id = $1 LIMIT 1)`,
      [daLat],
    );
    expect(await withSystem(pool, (tx) => queuePickWhenNeeded(tx, daLat))).toBe(false);
  });

  it('queues the ingest, not the picks, of one with almost no places', async () => {
    const town = await destination('vn-small-town', 3);
    await destinationSet(await tripTo(town));
    expect(await jobs('places.ingest')).toEqual([{ slug: 'vn-small-town' }]);
    expect(await jobs('places.pick')).toHaveLength(1);
  });

  it('queues nothing for one with a curated set', async () => {
    const hoiAn = await destination('vn-hoi-an', 50, 'editorial');
    await destinationSet(await tripTo(hoiAn));
    expect(await jobs('places.pick')).toHaveLength(1);
    expect(await jobs('places.ingest')).toHaveLength(1);
    expect(await withSystem(pool, (tx) => queuePickWhenNeeded(tx, hoiAn))).toBe(false);
  });
});
