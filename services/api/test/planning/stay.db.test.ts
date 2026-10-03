/**
 * Place detail from the trip's stay on the real schema: with a booked crew stay covering tonight,
 * `GET /v1/places/{id}?trip_id` answers distance and time from it; without one it answers neither.
 * The stay rules themselves are tested with the query (`packages/db/test/planning-stay.test.ts`).
 */
import { randomUUID } from 'node:crypto';

import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getPlaceDetail } from '../../src/places/detail';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let owner: string;
let destinationId: string;
let temple: string;

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

async function newTrip(): Promise<string> {
  const crew = await one('INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id', [
    'Bali',
    owner,
  ]);
  return one(
    `INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2) RETURNING id`,
    [crew, destinationId],
  );
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
  owner = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  destinationId = await one(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('bali', 'Bali', 'live', 'Asia/Makassar') RETURNING id`,
    [],
  );
  await pool.query(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Komaneka Ubud', 'stay', -8.5069, 115.2625)`,
    [destinationId],
  );
  temple = await one(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, 'Pura Tirta Empul', 'temple_shrine', -8.4153, 115.3154) RETURNING id`,
    [destinationId],
  );
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
});

const detailFor = (tripId: string) =>
  withSystem(pool, (tx) =>
    getPlaceDetail(tx, temple, { tripId, now: new Date('2026-11-02T09:00:00+08:00') }),
  );

describe('place detail from the stay', () => {
  it('answers distance and time from tonight’s stay', async () => {
    const tripId = await newTrip();
    await pool.query(
      `INSERT INTO bookings (trip_id, owner_id, type, title, starts_at, ends_at, tz, visibility)
       VALUES ($1, $2, 'stay', 'Komaneka Ubud', '2026-11-01T14:00:00+08:00',
               '2026-11-04T11:00:00+08:00', 'Asia/Makassar', 'crew')`,
      [tripId, owner],
    );
    const detail = await detailFor(tripId);
    expect(detail.distanceFromLodgingM).toBeGreaterThan(9_000);
    expect(detail.etaFromLodgingMinutes).toBeGreaterThan(0);
    expect(detail.etaFromLodgingIsEstimate).toBe(true);
  });

  it('answers no lodging time for a trip without a stay', async () => {
    const detail = await detailFor(await newTrip());
    expect(detail.distanceFromLodgingM).toBeUndefined();
    expect(detail.etaFromLodgingMinutes).toBeUndefined();
  });
});
