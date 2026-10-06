/**
 * The account purge against a migrated database, run as app_system exactly as the worker and the
 * api run it: every rule has the grant and the policy it needs, every statement runs for an account
 * with real rows behind it, nothing naming the user survives a delete or null rule, the crew keeps
 * its own rows and its balances still sum to zero, and a second purge changes nothing.
 */
import { PURGE_RULES, purgeStatements, ruleStatement } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { purgeAccount } from '../../src/account/purge';
import '../../src/schema';
import { withSystem } from '../../src/tx';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;

beforeAll(async () => {
  container = await startDbTestContainer();
}, 180_000);

afterAll(async () => {
  await container.stop();
});

async function seeded(): Promise<{ db: DbTestDatabase; f: PermissionFixture; uid: string }> {
  const db = await container.createDatabase();
  const f = await buildPermissionFixture(db.pool);
  const uid = f.actors.organiser;
  // What the member owes the organiser (to be written off) and what the organiser owes the
  // co-organiser (stays on the crew's balances).
  await db.pool.query(
    `INSERT INTO ledger_entries
       (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency, source_kind, source_id)
     VALUES ($1, $2, $3, $4, 5000, 'SGD', 'expense', uuidv7()),
            ($1, $2, $4, $3, 1200, 'SGD', 'payment', uuidv7()),
            ($1, $2, $4, $5, 2000, 'SGD', 'expense', uuidv7())`,
    [f.crewId, f.tripId, f.actors.member, uid, f.actors.coOrganiser],
  );
  // Ways into the crew the organiser handed out.
  await db.pool.query(
    `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
     VALUES ('ZZZZ99', 'crew', $1, $1, $2)`,
    [f.crewId, uid],
  );
  await db.pool.query(
    `INSERT INTO invites (crew_id, inviter_id, kind, expires_at)
     VALUES ($1, $2, 'generic', now() + interval '7 days')`,
    [f.crewId, uid],
  );
  await db.pool.query(
    `UPDATE users SET display_name = 'Winston', username = 'winston', home_airport = 'SIN'
      WHERE id = $1`,
    [uid],
  );
  return { db, f, uid };
}

async function count(db: DbTestDatabase, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n ${sql}`, params);
  return rows[0]?.n ?? -1;
}

/** `schema.table` → the name `has_table_privilege` and `pg_policies` want. */
function parts(table: string): { schema: string; name: string } {
  const [schema = '', name = ''] = table.split('.');
  return { schema, name };
}

describe('account purge', () => {
  it('holds the grant and the policy every rule needs as app_system', async () => {
    const db = await container.createDatabase();
    try {
      const missing: string[] = [];
      for (const rule of PURGE_RULES) {
        const kind = rule.action.kind;
        if (kind === 'keep' || kind === 'via') continue;
        const { schema, name } = parts(rule.table);
        const privilege = kind === 'delete' ? 'DELETE' : 'UPDATE';
        const granted =
          kind === 'delete'
            ? await db.pool.query<{ ok: boolean }>(
                `SELECT has_table_privilege('app_system', $1, 'DELETE') AS ok`,
                [rule.table],
              )
            : await db.pool.query<{ ok: boolean }>(
                `SELECT has_column_privilege('app_system', $1, $2, 'UPDATE') AS ok`,
                [rule.table, rule.column],
              );
        if (granted.rows[0]?.ok !== true) missing.push(`${rule.table}: no ${privilege} grant`);
        const policy = await db.pool.query<{ ok: boolean }>(
          `SELECT (NOT c.relrowsecurity) OR EXISTS (
                    SELECT 1 FROM pg_policies p
                     WHERE p.schemaname = $1 AND p.tablename = $2
                       AND ('app_system' = ANY (p.roles) OR 'public' = ANY (p.roles))
                       AND p.cmd IN ('ALL', $3)) AS ok
             FROM pg_class c WHERE c.oid = $4::regclass`,
          [schema, name, privilege, rule.table],
        );
        if (policy.rows[0]?.ok !== true) missing.push(`${rule.table}: no ${privilege} policy`);
      }
      expect(missing).toEqual([]);
    } finally {
      await db.drop();
    }
  });

  it('runs every statement for an account with rows behind it', async () => {
    const { db, uid } = await seeded();
    try {
      const failures: string[] = [];
      await withSystem(db.pool, async (tx) => {
        for (const statement of purgeStatements()) {
          await tx.query('SAVEPOINT step');
          try {
            await tx.query(statement.sql, [uid]);
            await tx.query('RELEASE SAVEPOINT step');
          } catch (error) {
            await tx.query('ROLLBACK TO SAVEPOINT step');
            failures.push(`${statement.label}: ${(error as Error).message}`);
          }
        }
      });
      expect(failures).toEqual([]);
    } finally {
      await db.drop();
    }
  });

  it('erases an install that still holds what its previous account left on it', async () => {
    const { db, f, uid } = await seeded();
    try {
      // The member used this phone first; the organiser then registered on it.
      const handedOver = crypto.randomUUID();
      await db.pool.query(
        `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
         VALUES ($1, $2, 'android', '1.0.0', 'en', 'Asia/Singapore')`,
        [handedOver, uid],
      );
      await db.pool.query(
        `INSERT INTO device_action_keys
           (key_id, device_id, user_id, secret_enc, scopes, expires_at, revoked_at)
         VALUES ($1, $2, $3, 'left-behind', ARRAY['ballot'], now() + interval '30 days', now())`,
        [crypto.randomUUID(), handedOver, f.actors.member],
      );
      await db.pool.query(
        `INSERT INTO alarms (user_id, device_id, leave_by_id, trip_id, fire_at, state)
         SELECT $1, $2, id, trip_id, '2026-10-14T19:00:00Z', 'scheduled'
           FROM leave_bys WHERE trip_id = $3 LIMIT 1`,
        [f.actors.member, handedOver, f.tripId],
      );
      expect(await count(db, 'FROM alarms WHERE device_id = $1', [handedOver])).toBe(1);

      const purged = await withSystem(db.pool, (tx) => purgeAccount(tx, uid));
      expect(purged).not.toBeNull();
      expect(await count(db, 'FROM devices WHERE user_id = $1', [uid])).toBe(0);
      expect(await count(db, 'FROM device_action_keys WHERE device_id = $1', [handedOver])).toBe(0);
      expect(await count(db, 'FROM alarms WHERE device_id = $1', [handedOver])).toBe(0);
    } finally {
      await db.drop();
    }
  });

  it('erases the person, keeps the crew whole, and is safe to run again', async () => {
    const { db, f, uid } = await seeded();
    try {
      const crewRowsBefore = await count(db, 'FROM crew_members WHERE crew_id = $1', [f.crewId]);
      const purged = await withSystem(db.pool, (tx) => purgeAccount(tx, uid));
      expect(purged).not.toBeNull();

      const survivors: string[] = [];
      for (const rule of PURGE_RULES) {
        if (rule.action.kind !== 'delete' && rule.action.kind !== 'null') continue;
        if (ruleStatement(rule) === null) continue;
        const [schema = '', name = ''] = rule.table.split('.');
        const left = await count(db, `FROM ${schema}."${name}" WHERE "${rule.column}" = $1`, [uid]);
        if (left !== 0) survivors.push(`${rule.table}.${rule.column}: ${left}`);
      }
      expect(survivors).toEqual([]);
      expect(await count(db, 'FROM device_action_keys WHERE user_id = $1', [uid])).toBe(0);
      expect(await count(db, 'FROM cmd_results WHERE uid = $1', [uid])).toBe(0);
      expect(await count(db, 'FROM cmd_log WHERE uid = $1', [uid])).toBe(0);

      const profile = await db.pool.query(
        `SELECT status, display_name, username::text AS username, home_airport, avatar_id
           FROM users WHERE id = $1`,
        [uid],
      );
      expect(profile.rows[0]).toEqual({
        status: 'purged',
        display_name: null,
        username: null,
        home_airport: null,
        avatar_id: null,
      });

      // The crew: same rows, the leaver a former member, everyone else as they were.
      expect(await count(db, 'FROM crew_members WHERE crew_id = $1', [f.crewId])).toBe(
        crewRowsBefore,
      );
      const membership = await db.pool.query<{ user_id: string; status: string }>(
        'SELECT user_id, status FROM crew_members WHERE crew_id = $1',
        [f.crewId],
      );
      const statusOf = (id: string) => membership.rows.find((row) => row.user_id === id)?.status;
      expect(statusOf(uid)).toBe('former');
      expect(statusOf(f.actors.member)).toBe('active');
      expect(await count(db, 'FROM trips WHERE id = $1', [f.tripId])).toBe(1);

      // Money: nobody is left owing the leaver; what the leaver owed stays; the crew nets to zero.
      const nets = await db.pool.query<{ user_id: string; net: string }>(
        `SELECT user_id, sum(delta)::text AS net FROM (
           SELECT creditor_id AS user_id, amount_minor AS delta FROM ledger_entries WHERE crew_id = $1
           UNION ALL
           SELECT debtor_id, -amount_minor FROM ledger_entries WHERE crew_id = $1) moves
          GROUP BY user_id`,
        [f.crewId],
      );
      const net = (id: string) => Number(nets.rows.find((row) => row.user_id === id)?.net ?? 0);
      expect(net(f.actors.member)).toBe(0);
      expect(net(f.actors.coOrganiser)).toBe(2000);
      expect(net(uid)).toBe(-2000);
      expect(nets.rows.reduce((sum, row) => sum + Number(row.net), 0)).toBe(0);

      // The join code and the invite the leaver handed out no longer open the crew.
      expect(
        await count(db, "FROM join_codes WHERE created_by = $1 AND status = 'active'", [uid]),
      ).toBe(0);
      expect(
        await count(db, "FROM invites WHERE inviter_id = $1 AND status <> 'revoked'", [uid]),
      ).toBe(0);

      const record = await db.pool.query<{ purged_at: Date | null }>(
        'SELECT purged_at FROM account_deletions WHERE user_id = $1',
        [uid],
      );
      expect(record.rows[0]?.purged_at).not.toBeNull();
      expect(await count(db, "FROM domain_events WHERE type = 'account.purged'", [])).toBe(1);

      const ledgerRows = await count(db, 'FROM ledger_entries WHERE crew_id = $1', [f.crewId]);
      expect(await withSystem(db.pool, (tx) => purgeAccount(tx, uid))).toBeNull();
      expect(await count(db, 'FROM ledger_entries WHERE crew_id = $1', [f.crewId])).toBe(
        ledgerRows,
      );
      expect(await count(db, "FROM domain_events WHERE type = 'account.purged'", [])).toBe(1);
    } finally {
      await db.drop();
    }
  });

  it('leaves an account that was never closed, or was restored, alone', async () => {
    const { db, f, uid } = await seeded();
    try {
      await db.pool.query('UPDATE account_deletions SET restored_at = now() WHERE user_id = $1', [
        uid,
      ]);
      expect(await withSystem(db.pool, (tx) => purgeAccount(tx, uid))).toBeNull();
      expect(await withSystem(db.pool, (tx) => purgeAccount(tx, f.actors.member))).toBeNull();
      const { rows } = await db.pool.query<{ display_name: string | null }>(
        'SELECT display_name FROM users WHERE id = $1',
        [uid],
      );
      expect(rows[0]?.display_name).toBe('Winston');
    } finally {
      await db.drop();
    }
  });
});
