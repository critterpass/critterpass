/**
 * `monitoring_reader` (the metrics collector's login): server statistics through pg_monitor,
 * including replication-slot lag, and no access to any row of application data.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

async function asMonitor<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE monitoring_reader');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

describe('monitoring_reader', () => {
  it('reads slot lag, connections and statement stats', async () => {
    await asMonitor(async (client) => {
      const slots = await client.query(
        `SELECT slot_name, active,
                pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
           FROM pg_replication_slots`,
      );
      expect(Array.isArray(slots.rows)).toBe(true);
      const activity = await client.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM pg_stat_activity',
      );
      expect(activity.rows[0]?.n).toBeGreaterThan(0);
      const role = await client.query<{ member: boolean }>(
        "SELECT pg_has_role('monitoring_reader', 'pg_monitor', 'USAGE') AS member",
      );
      expect(role.rows[0]?.member).toBe(true);
    });
  });

  it.each(['users', 'consents', 'domain_events', 'ops.ops_config'])(
    'cannot read %s',
    async (table) => {
      await expect(
        asMonitor((client) => client.query(`SELECT 1 FROM ${table} LIMIT 1`)),
      ).rejects.toThrow(/permission denied/u);
    },
  );
});
