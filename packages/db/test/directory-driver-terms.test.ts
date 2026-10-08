/**
 * The repair for drivers added from the directory before the command wrote their terms
 * (packages/db/migrations/*_directory_driver_terms.sql): a trip's copy of a listed driver that has
 * no terms row gets the one the command writes today, so he shows on the shortlist. A driver who
 * already has terms keeps them as they are, a driver the crew typed in by hand gets none, and a
 * second run changes nothing.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../src/tx';
import { firstRow } from './helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';
import { buildTripFixture, type TripFixture } from './helpers/trip-fixture';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../migrations');

let container: DbTestContainer;
let db: DbTestDatabase;
let trip: TripFixture;
let repair: string;

async function system<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(db.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function listing(name: string, sealedPhone: string): Promise<void> {
  await system(
    `INSERT INTO driver_listings (display_name, areas, languages, vehicle, seats, phone_e164_enc,
       phone_hash, status, consent_version, consent_at, key_hash)
     VALUES ($1, '{Ubud,Canggu}', '{en,id}', '{"model":"Toyota Avanza"}', 6, $2, $3, 'listed',
       'v1', now(), $4)`,
    [name, sealedPhone, `phone-${sealedPhone}`, `key-${sealedPhone}`],
  );
}

async function driver(name: string, sealedPhone: string): Promise<string> {
  const rows = await system<{ id: string }>(
    `INSERT INTO providers (trip_id, kind, name, contact_enc, added_by)
     VALUES ($1, 'driver', $2, $3, $4) RETURNING id`,
    [trip.tripId, name, sealedPhone, trip.memberId],
  );
  return firstRow(rows).id;
}

/** Applies the file the way the migration runner does: one transaction on the owner connection. */
async function runRepair(): Promise<void> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(repair);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

const terms = () =>
  system<Record<string, unknown>>(
    `SELECT provider_id, trip_id, source, status, area, languages, car, seats, price_minor,
            confirmed_fields, updated_at
       FROM provider_terms WHERE trip_id = $1 ORDER BY created_at`,
    [trip.tripId],
  );

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  trip = await buildTripFixture(db.pool);
  const file = (await readdir(MIGRATIONS_DIR)).find((name) =>
    name.endsWith('_directory_driver_terms.sql'),
  );
  if (file === undefined) throw new Error('the directory driver terms migration is missing');
  repair = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('terms for drivers added from the directory before they were written', () => {
  it('adds the one missing row, as the command writes it, and nothing else', async () => {
    await listing('Made Suarta', 'sealed-made');
    await listing('Ketut Rai', 'sealed-ketut');
    const without = await driver('Made Suarta', 'sealed-made');
    const withTerms = await driver('Ketut Rai', 'sealed-ketut');
    const byHand = await driver('Wayan', 'sealed-by-hand');
    await system(
      `INSERT INTO provider_terms (provider_id, trip_id, source, status, area)
       VALUES ($1, $2, 'crews', 'archived', 'Sanur')`,
      [withTerms, trip.tripId],
    );
    const before = await terms();
    expect(before.map((row) => row['provider_id'])).toEqual([withTerms]);

    await runRepair();

    const after = await terms();
    expect(after).toHaveLength(2);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]).toMatchObject({
      provider_id: without,
      trip_id: trip.tripId,
      source: 'crews',
      status: 'shortlisted',
      area: 'Ubud',
      languages: ['en', 'id'],
      car: 'Toyota Avanza',
      seats: 6,
      price_minor: null,
      confirmed_fields: [],
    });
    expect(after.map((row) => row['provider_id'])).not.toContain(byHand);

    await runRepair();
    expect(await terms()).toEqual(after);
  });
});
