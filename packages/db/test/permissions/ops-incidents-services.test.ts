/**
 * Console incidents and service monitoring (`ops.incidents`, `ops.service_health`,
 * `ops.vendor_spend_daily`): written by app_system, read by admin_reader (never written by it),
 * unreachable for app_user; read-only applies to maintenance only, and a measured value stays in
 * range.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser, randomId } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function asRole<T>(role: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

const TABLES = ['ops.incidents', 'ops.service_health', 'ops.vendor_spend_daily'] as const;

describe('ops incidents and services', () => {
  it('lets app_system write and admin_reader read, but not write', async () => {
    const id = randomId();
    await withSystem(db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO ops.incidents (id, kind, text, read_only, posted_by)
         VALUES ($1, 'maintenance', 'Database upgrade', true, $2)`,
        [id, randomId()],
      );
      await tx.query(
        `INSERT INTO ops.service_health (service, state, p95_ms, error_rate)
         VALUES ('apns', 'degraded', 380, 0.031)`,
      );
      await tx.query(
        `INSERT INTO ops.vendor_spend_daily (service, day, amount_micros, currency, source)
         VALUES ('railway', '2026-10-01', 212000000, 'USD', 'manual')`,
      );
    });
    const read = await asRole('admin_reader', (tx) =>
      tx.query<{ text: string }>('SELECT text FROM ops.incidents WHERE id = $1', [id]),
    );
    expect(read.rows).toEqual([{ text: 'Database upgrade' }]);
    for (const table of TABLES) {
      await expect(
        asRole('admin_reader', (tx) => tx.query(`SELECT 1 FROM ${table} LIMIT 1`)),
      ).resolves.toBeDefined();
      await expect(
        asRole('admin_reader', (tx) => tx.query(`DELETE FROM ${table}`)),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('is unreachable for app_user', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    for (const table of TABLES) {
      await expect(
        withUser(db.pool, uid, anonymousActor().device, (tx) =>
          tx.query(`SELECT 1 FROM ${table} LIMIT 1`),
        ),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('keeps read-only to maintenance and measured values in range', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO ops.incidents (id, kind, text, read_only, posted_by)
           VALUES ($1, 'incident', 'Push slow', true, $2)`,
          [randomId(), randomId()],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO ops.service_health (service, state, error_rate) VALUES ('fcm', 'ok', 1.5)",
        ),
      ),
    ).rejects.toThrow(/check constraint|numeric field overflow/i);
  });
});
