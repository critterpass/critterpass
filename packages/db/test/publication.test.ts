/**
 * Verifies the live `powersync` publication matches `@cp/db#computePublicationAllowList` exactly,
 * that `powersync_repl`'s grants never reach a C3/S table, that `guide_reader` has no access to the
 * `public` schema at all, and that `ops.ops_config`/`client_config` behave per docs/data-model.md
 * §3.14 (adm-only config store, public-only projection).
 */
import { computePublicationAllowList } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../src/tx';
import { anonymousActor, insertUser } from './helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

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

async function publishedTables(): Promise<string[]> {
  const { rows } = await db.pool.query<{ tablename: string }>(
    "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync'",
  );
  return rows.map((row) => row.tablename).sort();
}

async function grantedSelect(role: string, table: string): Promise<boolean> {
  const { rows } = await db.pool.query(
    `SELECT 1 FROM information_schema.role_table_grants
     WHERE grantee = $1 AND table_name = $2 AND privilege_type = 'SELECT'`,
    [role, table],
  );
  return rows.length > 0;
}

const NEVER_PUBLISHED = ['media_objects', 'cmd_log', 'rt_outbox', 'domain_events'] as const;

describe('powersync publication', () => {
  it('equals @cp/db#computePublicationAllowList exactly', async () => {
    const allowList = [...computePublicationAllowList()].sort();
    expect(allowList.length).toBeGreaterThan(0);
    expect(await publishedTables()).toEqual(allowList);
  });

  it('never publishes a known C3/S table despite it existing in the schema', async () => {
    const published = new Set(await publishedTables());
    for (const table of NEVER_PUBLISHED) {
      expect(published.has(table)).toBe(false);
    }
  });

  it('grants powersync_repl SELECT on every allow-listed table', async () => {
    for (const table of computePublicationAllowList()) {
      expect(await grantedSelect('powersync_repl', table)).toBe(true);
    }
  });

  it('grants powersync_repl nothing on cmd_log/rt_outbox/domain_events/media_objects or ops.*', async () => {
    for (const table of NEVER_PUBLISHED) {
      expect(await grantedSelect('powersync_repl', table)).toBe(false);
    }
    const { rows } = await db.pool.query(
      "SELECT 1 FROM information_schema.role_table_grants WHERE grantee = 'powersync_repl' AND table_schema = 'ops'",
    );
    expect(rows).toHaveLength(0);
  });
});

describe('guide_reader has no grant on the public schema', () => {
  it('cannot select a plain public-schema table like destinations', async () => {
    const uid = await insertUser(db.pool);
    await expect(
      withGuideReader(db.pool, uid, anonymousActor().uid, (tx) =>
        tx.query('SELECT * FROM destinations'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('ops.admin_audit: RLS class S', () => {
  it('denies app_user entirely', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT * FROM ops.admin_audit'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system record and read an entry', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO ops.admin_audit (action, target_kind, target_id) VALUES ('close_account', 'user', gen_random_uuid())",
      ),
    );
    const rows = await withSystem(db.pool, (tx) => tx.query('SELECT action FROM ops.admin_audit'));
    expect(rows.rows).toEqual([{ action: 'close_account' }]);
  });
});

describe('ops.ops_config and its client_config projection', () => {
  it('denies app_user any access to ops.ops_config', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query('SELECT * FROM ops.ops_config'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('mirrors an is_public row into client_config, readable by app_user', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO ops.ops_config (key, value, is_public) VALUES ('seat.cap_free', '6'::jsonb, true)",
      ),
    );
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query<{ value: number }>("SELECT value FROM client_config WHERE key = 'seat.cap_free'"),
    );
    expect(rows.rows).toEqual([{ value: 6 }]);
  });

  it('never mirrors a non-public row', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO ops.ops_config (key, value, is_public) VALUES ('internal.flag', 'true'::jsonb, false)",
      ),
    );
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query("SELECT 1 FROM client_config WHERE key = 'internal.flag'"),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('removes the projection once a key is flipped back to private', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO ops.ops_config (key, value, is_public) VALUES ('guide.free_daily_limit', '30'::jsonb, true)",
      ),
    );
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE ops.ops_config SET is_public = false WHERE key = 'guide.free_daily_limit'"),
    );
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query("SELECT 1 FROM client_config WHERE key = 'guide.free_daily_limit'"),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('removes the projection when the source row is deleted', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query(
        "INSERT INTO ops.ops_config (key, value, is_public) VALUES ('perk.tier', '\"boost\"'::jsonb, true)",
      ),
    );
    await withSystem(db.pool, (tx) =>
      tx.query("DELETE FROM ops.ops_config WHERE key = 'perk.tier'"),
    );
    const rows = await withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
      tx.query("SELECT 1 FROM client_config WHERE key = 'perk.tier'"),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('denies app_user any write to client_config directly', async () => {
    await expect(
      withUser(db.pool, anonymousActor().uid, anonymousActor().device, (tx) =>
        tx.query("INSERT INTO client_config (key, value) VALUES ('hack', '1'::jsonb)"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
