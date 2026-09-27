/**
 * `auth` schema isolation (docs/data-model.md §2, phase-9 T1 done-when): no role but `auth` itself
 * ever gets `USAGE` on the schema, let alone a table grant — checked both by direct attempt
 * (`app_user`/`guide_reader`, reachable via `SET ROLE` from the admin connection) and by catalog
 * (`powersync_repl`, a real LOGIN role with no password provisioned in this test database, so it is
 * checked the same way packages/db/test/publication.test.ts checks it for the `ops` schema).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
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

async function hasSchemaUsage(role: string): Promise<boolean> {
  const { rows } = await db.pool.query<{ has_schema_privilege: boolean }>(
    "SELECT has_schema_privilege($1, 'auth', 'USAGE') AS has_schema_privilege",
    [role],
  );
  return rows[0]?.has_schema_privilege ?? false;
}

describe('auth schema: no grant to app_user, guide_reader or powersync_repl', () => {
  it('denies app_user SELECT on auth.user by direct attempt', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, uid, anonymousActor().device, (tx) =>
        tx.query('SELECT 1 FROM auth."user" WHERE id = $1', [uid]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies guide_reader SELECT on auth.user by direct attempt', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withGuideReader(db.pool, uid, anonymousActor().uid, (tx) =>
        tx.query('SELECT 1 FROM auth."user" WHERE id = $1', [uid]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('grants no SCHEMA USAGE on auth to app_user, guide_reader or powersync_repl', async () => {
    expect(await hasSchemaUsage('app_user')).toBe(false);
    expect(await hasSchemaUsage('guide_reader')).toBe(false);
    expect(await hasSchemaUsage('powersync_repl')).toBe(false);
  });

  it('grants no table privilege in auth to app_user, guide_reader or powersync_repl', async () => {
    const { rows } = await db.pool.query<{ grantee: string; table_name: string }>(
      `SELECT grantee, table_name FROM information_schema.role_table_grants
       WHERE table_schema = 'auth' AND grantee IN ('app_user', 'guide_reader', 'powersync_repl')`,
    );
    expect(rows).toEqual([]);
  });

  it('grants the auth role full access to its own tables', async () => {
    for (const table of ['user', 'session', 'account', 'verification', 'jwks']) {
      const { rows } = await db.pool.query<{ privilege_type: string }>(
        `SELECT privilege_type FROM information_schema.role_table_grants
         WHERE table_schema = 'auth' AND table_name = $1 AND grantee = 'auth'`,
        [table],
      );
      const privileges = rows.map((row) => row.privilege_type).sort();
      expect(privileges, `auth role privileges on auth.${table}`).toEqual([
        'DELETE',
        'INSERT',
        'SELECT',
        'UPDATE',
      ]);
    }
  });

  it('never publishes an auth.* table on the powersync publication', async () => {
    const { rows } = await db.pool.query<{ schemaname: string; tablename: string }>(
      "SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'powersync' AND schemaname = 'auth'",
    );
    expect(rows).toEqual([]);
  });
});

describe('auth.user unique constraints', () => {
  // Inserted via the admin connection directly: app_system has no grant on auth.* either (only the
  // dedicated `auth` role does), so this proves the constraint itself, not a role's access to it.
  it('rejects a second row with the same phone number', async () => {
    await db.pool.query(
      `INSERT INTO auth."user" (id, name, email, phone_number)
       VALUES (uuidv7(), 'One', 'one@example.com', '+6588880001')`,
    );
    await expect(
      db.pool.query(
        `INSERT INTO auth."user" (id, name, email, phone_number)
         VALUES (uuidv7(), 'Two', 'two@example.com', '+6588880001')`,
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
