/**
 * `admin_reader` (docs/data-model.md §2): SELECT on `ops.*` plus the non-C3 columns of registered
 * `public` tables, never a write. Every column it can read is proven classified and below C3, every
 * C3 column is proven unreadable, and the tables it was granted match the privacy-map generator.
 */
import {
  ADMIN_READER_DENIED_CLASSES,
  columnPrivacyClass,
  computeAdminReaderGrants,
  getTablePrivacy,
  listRegisteredTables,
  renderAdminReaderGrantSql,
} from '@cp/domain';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '../../src/schema';
import { withSystem } from '../../src/tx';
import { insertUser } from '../helpers/actors';
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

async function asAdminReader<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE admin_reader');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

async function publicColumns(): Promise<Map<string, string[]>> {
  const { rows } = await db.pool.query<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name FROM information_schema.columns c
     JOIN pg_class k ON k.relname = c.table_name
     JOIN pg_namespace n ON n.oid = k.relnamespace AND n.nspname = 'public'
     WHERE c.table_schema = 'public' AND k.relkind = 'r'`,
  );
  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row.column_name]);
  }
  return byTable;
}

async function adminReaderColumnGrants(): Promise<Map<string, string[]>> {
  const { rows } = await db.pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.column_privileges
     WHERE grantee = 'admin_reader' AND table_schema = 'public' AND privilege_type = 'SELECT'`,
  );
  const byTable = new Map<string, string[]>();
  for (const row of rows) {
    byTable.set(row.table_name, [...(byTable.get(row.table_name) ?? []), row.column_name]);
  }
  return byTable;
}

describe('admin_reader: the privacy boundary', () => {
  it('can read only classified, non-C3/C4 public columns', async () => {
    const granted = await adminReaderColumnGrants();
    expect(granted.size).toBeGreaterThan(0);
    for (const [table, columns] of granted) {
      const privacy = getTablePrivacy(table);
      expect(
        privacy,
        `${table} is readable by admin_reader but has no privacy class`,
      ).toBeDefined();
      if (privacy === undefined) continue;
      for (const column of columns) {
        expect(
          ADMIN_READER_DENIED_CLASSES.has(columnPrivacyClass(privacy, column)),
          `${table}.${column}`,
        ).toBe(false);
      }
    }
  });

  it('fails to SELECT any C3 column of any registered table', async () => {
    const columns = await publicColumns();
    const sensitive: Array<[string, string]> = [];
    for (const table of listRegisteredTables()) {
      const privacy = getTablePrivacy(table);
      if (privacy === undefined) continue;
      for (const column of columns.get(table) ?? []) {
        if (ADMIN_READER_DENIED_CLASSES.has(columnPrivacyClass(privacy, column))) {
          sensitive.push([table, column]);
        }
      }
    }
    expect(sensitive.map(([table]) => table)).toEqual(
      expect.arrayContaining(['user_private', 'device_action_keys']),
    );
    for (const [table, column] of sensitive) {
      await expect(
        asAdminReader((tx) => tx.query(`SELECT ${column} FROM ${table} LIMIT 1`)),
        `${table}.${column}`,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('matches the privacy-map generator on every table it was granted', async () => {
    const columns = await publicColumns();
    const expected = computeAdminReaderGrants(
      [...columns].map(([table, cols]) => ({ table, columns: cols })),
      getTablePrivacy,
    );
    const granted = await adminReaderColumnGrants();
    for (const grant of expected.filter((entry) => granted.has(entry.table))) {
      expect(
        [...(granted.get(grant.table) ?? [])].sort(),
        `admin_reader grant drifted from the privacy map; a new migration needs:\n${renderAdminReaderGrantSql(grant)}`,
      ).toEqual(grant.columns);
    }
    // Every table registered when the console shipped is covered.
    for (const table of ['users', 'trips', 'crews', 'moderation_reports', 'cmd_results']) {
      expect(granted.has(table), table).toBe(true);
    }
  });

  it('reads rows of granted tables through its own RLS policy', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx, { username: 'reader-probe' }));
    const { rows } = await asAdminReader((tx) =>
      tx.query<{ username: string }>('SELECT username FROM users WHERE id = $1', [uid]),
    );
    expect(rows).toEqual([{ username: 'reader-probe' }]);
  });

  it('reads every ops table', async () => {
    const { rows } = await db.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'ops'",
    );
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const { tablename } of rows) {
      await expect(
        asAdminReader((tx) => tx.query(`SELECT * FROM ops.${tablename} LIMIT 1`)),
        tablename,
      ).resolves.toBeDefined();
    }
  });

  it('holds no write privilege anywhere and no access to the auth schema', async () => {
    const tableWrites = await db.pool.query(
      `SELECT table_schema, table_name, privilege_type FROM information_schema.role_table_grants
       WHERE grantee = 'admin_reader' AND privilege_type <> 'SELECT'`,
    );
    expect(tableWrites.rows).toEqual([]);
    const columnWrites = await db.pool.query(
      `SELECT table_name, column_name, privilege_type FROM information_schema.column_privileges
       WHERE grantee = 'admin_reader' AND privilege_type <> 'SELECT'`,
    );
    expect(columnWrites.rows).toEqual([]);
    await expect(
      asAdminReader((tx) => tx.query("UPDATE users SET username = 'x' WHERE false")),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asAdminReader((tx) => tx.query('SELECT id FROM auth.user LIMIT 1')),
    ).rejects.toThrow(/permission denied/i);
  });
});
