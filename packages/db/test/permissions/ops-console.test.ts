/**
 * `ops` schema boundary (docs/data-model.md §3.16): app_user reaches nothing in `ops` except
 * inserting its own `ops.approvals` row; `ops.admin_audit` is append-only for every role; the
 * partner adapter seed and the scoped-flag projection behave as the console expects.
 */
import {
  CONCIERGE_TASK_KINDS,
  CONCIERGE_TASK_STATUSES,
  MODERATION_REPORT_STATUSES,
  MODERATION_VERDICTS,
  PARTNER_COPY_MODES,
  PARTNER_KEYS,
} from '@cp/domain';
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
    if (role !== 'owner') await client.query(`SET LOCAL ROLE ${role}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

async function opsTables(): Promise<string[]> {
  const { rows } = await db.pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'ops' ORDER BY tablename",
  );
  return rows.map((row) => row.tablename);
}

describe('app_user and the ops schema', () => {
  it('cannot read any ops table', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    for (const table of await opsTables()) {
      await expect(
        withUser(db.pool, uid, anonymousActor().device, (tx) =>
          tx.query(`SELECT 1 FROM ops.${table} LIMIT 1`),
        ),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('holds exactly one ops privilege: INSERT on ops.approvals', async () => {
    const tables = await db.pool.query(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'app_user' AND table_schema = 'ops'`,
    );
    expect(tables.rows).toEqual([]);
    const columns = await db.pool.query<{ table_name: string; privilege_type: string }>(
      `SELECT DISTINCT table_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee = 'app_user' AND table_schema = 'ops'`,
    );
    expect(columns.rows).toEqual([{ table_name: 'approvals', privilege_type: 'INSERT' }]);
  });

  it('inserts its own approval but never one for another user, and cannot read it back', async () => {
    const owner = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    const device = anonymousActor().device;
    const insert = (uid: string) => (tx: pg.PoolClient) =>
      tx.query(
        `INSERT INTO ops.approvals (user_id, subject_kind, subject_id, text_shown)
         VALUES ($1, 'vendor_message', $2, 'Send: we arrive at 7pm')`,
        [uid, randomId()],
      );

    await expect(withUser(db.pool, owner, device, insert(owner))).resolves.toBeDefined();
    await expect(withUser(db.pool, owner, device, insert(other))).rejects.toThrow(
      /row-level security/i,
    );
    await expect(
      withUser(db.pool, owner, device, (tx) => tx.query('SELECT 1 FROM ops.approvals')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, owner, device, (tx) =>
        tx.query("UPDATE ops.approvals SET text_shown = 'changed'"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, owner, device, (tx) => tx.query('DELETE FROM ops.approvals')),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('ops.admin_audit is append-only', () => {
  it.each(['app_system', 'admin_reader', 'app_user', 'owner'])(
    'refuses UPDATE, DELETE and TRUNCATE as %s',
    async (role) => {
      await withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO ops.admin_audit (admin_id, action, target_kind) VALUES ($1, 'probe', 'user')",
          [randomId()],
        ),
      );
      for (const statement of [
        "UPDATE ops.admin_audit SET action = 'rewritten'",
        'DELETE FROM ops.admin_audit',
        'TRUNCATE ops.admin_audit',
      ]) {
        await expect(
          asRole(role, (tx) => tx.query(statement)),
          statement,
        ).rejects.toThrow(/append-only|permission denied/i);
      }
      const { rows } = await db.pool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM ops.admin_audit',
      );
      expect(rows[0]?.n).toBeGreaterThan(0);
    },
  );
});

describe('partner adapters and flag projection', () => {
  it('seeds every adapter off on link copy except Viator, with matching public copy flags', async () => {
    const { rows } = await db.pool.query<{ partner: string; enabled: boolean; copy_mode: string }>(
      'SELECT partner, enabled, copy_mode FROM ops.partner_adapters ORDER BY partner',
    );
    expect(rows.map((row) => row.partner)).toEqual([...PARTNER_KEYS].sort());
    for (const row of rows) {
      const viator = row.partner === 'viator_booking';
      expect(row.enabled).toBe(viator);
      expect(row.copy_mode).toBe(viator ? 'booking' : 'link');
    }
    const projected = await db.pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM client_config WHERE key LIKE 'supplier.%' ORDER BY key",
    );
    expect(projected.rows).toContainEqual({ key: 'supplier.viator_booking.enabled', value: true });
    expect(projected.rows).toContainEqual({
      key: 'supplier.klook_activity.copy_mode',
      value: 'link',
    });
    expect(projected.rows).toHaveLength(PARTNER_KEYS.length * 2);
  });

  it('projects only all-audience public keys to client_config', async () => {
    await withSystem(db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO ops.ops_config (key, value, is_public, audience)
         VALUES ('probe.scoped', 'true'::jsonb, true, '{"kind": "cohort", "cohort": "beta"}')`,
      );
      await tx.query(
        "INSERT INTO ops.ops_config (key, value, is_public) VALUES ('probe.all', '1'::jsonb, true)",
      );
    });
    const before = await db.pool.query<{ key: string }>(
      "SELECT key FROM client_config WHERE key LIKE 'probe.%' ORDER BY key",
    );
    expect(before.rows).toEqual([{ key: 'probe.all' }]);

    await withSystem(db.pool, (tx) =>
      tx.query(
        `UPDATE ops.ops_config SET audience = '{"kind": "uids", "uids": []}' WHERE key = 'probe.all'`,
      ),
    );
    const after = await db.pool.query("SELECT key FROM client_config WHERE key LIKE 'probe.%'");
    expect(after.rows).toEqual([]);
  });
});

describe('CHECK constraints follow the domain enums', () => {
  it.each([
    ['ops.concierge_tasks', CONCIERGE_TASK_KINDS],
    ['ops.concierge_tasks', CONCIERGE_TASK_STATUSES],
    ['ops.partner_adapters', PARTNER_KEYS],
    ['ops.partner_adapters', PARTNER_COPY_MODES],
    ['public.moderation_reports', MODERATION_REPORT_STATUSES],
    ['public.moderation_reports', MODERATION_VERDICTS],
  ] as const)('%s allows every value of its enum', async (table, values) => {
    const { rows } = await db.pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = $1::regclass AND contype = 'c'`,
      [table],
    );
    const definitions = rows.map((row) => row.def).join('\n');
    for (const value of values) expect(definitions).toContain(`'${value}'`);
  });
});
