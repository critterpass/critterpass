/**
 * Every column that names a user has a purge rule (packages/domain/src/account/purge-policy.ts):
 * introspected against a migrated database, so a table added by any later migration fails here
 * until its purge behaviour is decided. Covers foreign keys to `users` / `auth.user` in every
 * schema but `auth` (Better Auth's own rows go through `app.purge_account_auth`), plus the few
 * user columns kept without a foreign key.
 */
import { getTablePrivacy, PURGE_RULES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '../../src/schema';
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

/** User columns without a foreign key (logs and provider ledgers). */
const UNREFERENCED_USER_COLUMNS = [
  'public.cmd_log.uid',
  'public.cmd_results.uid',
  'public.billing_events.app_user_id',
];

async function userColumns(): Promise<string[]> {
  const { rows } = await db.pool.query<{ ref: string }>(
    `SELECT DISTINCT cl.relnamespace::regnamespace::text || '.' || cl.relname || '.' || a.attname AS ref
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
      WHERE con.contype = 'f'
        AND con.confrelid IN ('public.users'::regclass, 'auth."user"'::regclass)
        AND cl.relnamespace::regnamespace::text <> 'auth'
      ORDER BY 1`,
  );
  return [...rows.map((row) => row.ref), ...UNREFERENCED_USER_COLUMNS];
}

describe('purge policy coverage', () => {
  it('gives every user-referencing column a purge rule', async () => {
    const columns = await userColumns();
    expect(columns.length).toBeGreaterThan(100);
    const ruled = new Set(PURGE_RULES.map((rule) => `${rule.table}.${rule.column}`));
    const missing = columns.filter((ref) => !ruled.has(ref));
    expect(missing, 'columns naming a user with no purge rule').toEqual([]);
  });

  it('names only real columns', async () => {
    const { rows } = await db.pool.query<{ ref: string }>(
      `SELECT table_schema || '.' || table_name || '.' || column_name AS ref
         FROM information_schema.columns WHERE table_schema IN ('public', 'ops')`,
    );
    const real = new Set(rows.map((row) => row.ref));
    const unknown = PURGE_RULES.map((rule) => `${rule.table}.${rule.column}`).filter(
      (ref) => !real.has(ref),
    );
    expect(unknown).toEqual([]);
  });

  it('deletes every C3 table and keeps nothing private under a keep rule', () => {
    for (const rule of PURGE_RULES) {
      const table = rule.table.replace(/^public\./, '');
      if (getTablePrivacy(table)?.class !== 'C3') continue;
      expect(['delete', 'via', 'null'], rule.table).toContain(rule.action.kind);
    }
  });
});
