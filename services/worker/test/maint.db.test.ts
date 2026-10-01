/**
 * `maint.purge` and `maint.anon_gc` against a real migrated Postgres. Fixture rows are written
 * through the owner connection so their timestamps can be back-dated; the jobs themselves run as
 * app_system exactly as in production.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { collectAnonymousAccounts } from '../src/jobs/maint/anon-gc';
import { purgeExpired, type PurgeTableReport } from '../src/jobs/maint/purge';
import { silent, startJobsHarness, type JobsHarness } from './helpers/jobs-harness';

let harness: JobsHarness;
const q = (sql: string, params: unknown[] = []) => harness.pool.query(sql, params);

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n ${sql}`,
    params,
  );
  return rows[0]?.n ?? -1;
}

async function seedTimers(rows: number, status: string, ageDays: number): Promise<void> {
  await q(
    `INSERT INTO scheduled_events (kind, ref_id, local_at, tz, due_at, status, updated_at)
     SELECT 'poll.close', gen_random_uuid(), now(), 'UTC', now(), $2, now() - make_interval(days => $3)
     FROM generate_series(1, $1)`,
    [rows, status, ageDays],
  );
}

/** One user's notification rows on both sides of each table's retention window. */
async function seedNotificationTables(): Promise<{
  uid: string;
  deviceId: string;
  inboxId: string;
}> {
  const uid = randomUUID();
  const deviceId = randomUUID();
  await q("INSERT INTO users (id, status) VALUES ($1, 'anonymous')", [uid]);
  await q(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
     VALUES ($1, $2, 'ios', '1.0.0', 'en', 'UTC')`,
    [deviceId, uid],
  );
  const { rows } = await q(
    `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body,
       dedupe_key, local_date, created_at)
     SELECT $1, 'nudge', 'cp.generic', 'budgeted', '{"kind":"system"}', 't', 't', 't', k, CURRENT_DATE,
       now() - make_interval(days => d)
     FROM (VALUES ('old', 91), ('new', 10)) AS v(k, d)
     RETURNING id, dedupe_key`,
    [uid],
  );
  const oldNotification = (rows as { id: string; dedupe_key: string }[]).find(
    (r) => r.dedupe_key === 'old',
  );
  const inbox = await q(
    "INSERT INTO inbox_items (user_id, kind, notification_id) VALUES ($1, 'nudge', $2) RETURNING id",
    [uid, oldNotification?.id],
  );
  await q(
    `INSERT INTO ping_ledger (user_id, local_date) VALUES ($1, CURRENT_DATE - 31), ($1, CURRENT_DATE)`,
    [uid],
  );
  await q(
    `INSERT INTO roundups (user_id, local_date, tz) VALUES ($1, CURRENT_DATE - 31, 'UTC'), ($1, CURRENT_DATE, 'UTC')`,
    [uid],
  );
  await q(
    `INSERT INTO push_tokens (device_id, kind, token, env, invalid_at)
     SELECT $1, 'apns_alert', gen_random_uuid()::text, 'prod', v.at
     FROM (VALUES (now() - interval '8 days'), (now() - interval '1 day'), (NULL::timestamptz)) AS v(at)`,
    [deviceId],
  );
  return { uid, deviceId, inboxId: (inbox.rows[0] as { id: string }).id };
}

describe('maint.purge', () => {
  it('deletes only expired rows, in batches of at most 5000', async () => {
    // Timers are few: every row pays scheduled_events' time-zone check (a pg_timezone_names scan).
    await seedTimers(30, 'enqueued', 40);
    await seedTimers(10, 'enqueued', 1);
    await seedTimers(5, 'pending', 90);

    await q(
      `INSERT INTO rt_outbox (channel, payload, idem_key, kind, created_at, published_at, attempts)
       SELECT 'user:#' || gen_random_uuid(), '{}', gen_random_uuid(), 'publish', now() - make_interval(days => a),
              CASE WHEN p THEN now() - make_interval(days => a) END, t
       FROM (VALUES (8, true, 0, 12000), (1, true, 0, 20), (8, false, 10, 5), (8, false, 2, 5)) AS v(a, p, t, n),
            generate_series(1, n)`,
    );
    await q(
      `INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, payload, occurred_at)
       SELECT gen_random_uuid(), 'trip.created', 'trip', gen_random_uuid(), 'system', '{}',
              now() - make_interval(days => d)
       FROM (VALUES (401), (399)) AS v(d), generate_series(1, 10)`,
    );
    // cmd_log age / cmd_results age (null = no result): old+none, old+old, old+recent, recent+none.
    await q(
      `WITH seeded AS (
         INSERT INTO cmd_log (op_id, uid, cmd, payload_hash, created_at)
         SELECT gen_random_uuid(), gen_random_uuid(), 'test', 'h', now() - make_interval(days => l)
         FROM (VALUES (31, NULL::int, 10), (31, 15, 5), (31, 5, 3), (2, NULL::int, 5)) AS v(l, r, n),
              generate_series(1, n)
         RETURNING op_id, uid, created_at
       )
       SELECT 1`,
    );
    await q(
      `INSERT INTO cmd_results (op_id, uid, cmd, status, server_ts)
       SELECT op_id, uid, 'test', 'applied',
              now() - make_interval(days => CASE WHEN rn <= 5 THEN 15 ELSE 5 END)
       FROM (SELECT op_id, uid, row_number() OVER (ORDER BY op_id) AS rn FROM cmd_log
             WHERE created_at < now() - interval '30 days'
             ORDER BY op_id LIMIT 8) AS picked`,
    );

    const notified = await seedNotificationTables();

    const reports = await purgeExpired(harness.pool, { batchSize: 9000 });
    const byTable = new Map<string, PurgeTableReport>(reports.map((r) => [r.table, r]));

    expect(byTable.get('rt_outbox')?.batches).toEqual([5000, 5000, 2005]);
    for (const report of reports) {
      for (const batch of report.batches) expect(batch).toBeLessThanOrEqual(5000);
    }
    expect(byTable.get('scheduled_events')?.deleted).toBe(30);
    expect(await count("FROM scheduled_events WHERE status = 'enqueued'")).toBe(10);
    expect(await count("FROM scheduled_events WHERE status = 'pending'")).toBe(5);

    expect(await count('FROM rt_outbox WHERE published_at IS NOT NULL')).toBe(20);
    expect(await count('FROM rt_outbox WHERE published_at IS NULL')).toBe(5);

    expect(byTable.get('domain_events')?.deleted).toBe(10);
    expect(await count('FROM domain_events')).toBe(10);

    expect(byTable.get('cmd_results')?.deleted).toBe(5);
    expect(await count('FROM cmd_results')).toBe(3);
    // 18 old log rows: 10 had no result, 5 lost theirs this run; 3 still have a recent result.
    expect(byTable.get('cmd_log')?.deleted).toBe(10 + 5 + 10 - 10);
    expect(await count("FROM cmd_log WHERE created_at < now() - interval '30 days'")).toBe(3);
    expect(await count("FROM cmd_log WHERE created_at > now() - interval '30 days'")).toBe(5);

    expect(byTable.get('notifications')).toEqual({
      table: 'notifications',
      deleted: 1,
      batches: [1],
    });
    expect(await count('FROM notifications WHERE user_id = $1', [notified.uid])).toBe(1);
    // The inbox item outlives the notification it came from; only the link is cleared.
    expect(
      await count('FROM inbox_items WHERE id = $1 AND notification_id IS NULL', [notified.inboxId]),
    ).toBe(1);
    expect(byTable.get('ping_ledger')?.deleted).toBe(1);
    expect(byTable.get('roundups')?.deleted).toBe(1);
    expect(byTable.get('push_tokens')?.deleted).toBe(1);
    expect(await count('FROM push_tokens WHERE device_id = $1', [notified.deviceId])).toBe(2);

    const [missing] = await purgeExpired(harness.pool, {
      rules: [{ kind: 'direct', table: 'not_created_yet', column: 'created_at', ttlDays: 30 }],
    });
    expect(missing).toEqual({
      table: 'not_created_yet',
      deleted: 0,
      batches: [],
      skipped: 'missing_table',
    });

    const again = await purgeExpired(harness.pool);
    expect(again.reduce((sum, r) => sum + r.deleted, 0)).toBe(0);
  }, 120_000);

  it('refuses a retention under one day or a batch over 5000 at the database', async () => {
    await expect(
      q("SELECT app.purge_expired('domain_events', interval '1 hour', 10)"),
    ).rejects.toThrow(/under one day/);
    await expect(
      q("SELECT app.purge_expired('domain_events', interval '2 days', 5001)"),
    ).rejects.toThrow(/1..5000/);
    await expect(q("SELECT app.purge_expired('users', interval '2 days', 10)")).rejects.toThrow(
      /no retention rule/,
    );
  });
});

interface AccountSpec {
  readonly anonymous?: boolean;
  readonly inactiveDays: number;
  readonly sessionDaysAgo?: number;
  readonly crew?: boolean;
  readonly purchase?: boolean;
}

async function seedAccount(spec: AccountSpec): Promise<string> {
  const uid = randomUUID();
  const anonymous = spec.anonymous ?? true;
  const age = `now() - make_interval(days => ${spec.inactiveDays})`;
  await q(
    `INSERT INTO auth."user" (id, name, email, is_anonymous, created_at, updated_at)
     VALUES ($1, 'Anonymous', $2, $3, ${age}, ${age})`,
    [uid, `temp-${uid}@anonymous.placeholder.invalid`, anonymous],
  );
  await q(
    `INSERT INTO users (id, status, created_at, updated_at) VALUES ($1, $2, ${age}, ${age})`,
    [uid, anonymous ? 'anonymous' : 'registered'],
  );
  await q('INSERT INTO user_settings (user_id) VALUES ($1)', [uid]);
  await q(`INSERT INTO user_entitlements (user_id, pass_plus, sources) VALUES ($1, $2, $3)`, [
    uid,
    spec.purchase ?? false,
    spec.purchase ? '["app_store"]' : '[]',
  ]);
  // The install the key belongs to, with a token and a notification: personal rows that go with it.
  const deviceId = randomUUID();
  await q(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
     VALUES ($1, $2, 'ios', '1.0.0', 'en', 'UTC')`,
    [deviceId, uid],
  );
  await q(
    "INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, 'apns_alert', $2, 'prod')",
    [deviceId, `token-${uid}`],
  );
  await q(
    `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body,
       dedupe_key, local_date)
     VALUES ($1, 'nudge', 'cp.generic', 'budgeted', '{"kind":"system"}', 't', 't', 't', 'seed', CURRENT_DATE)`,
    [uid],
  );
  await q(
    `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
     VALUES (gen_random_uuid()::text, $2, $1, 'enc', '{read_notification}', now() + interval '30 days')`,
    [uid, deviceId],
  );
  if (spec.sessionDaysAgo !== undefined) {
    await q(
      `INSERT INTO auth.session (id, user_id, token, expires_at, updated_at)
       VALUES (gen_random_uuid(), $1, gen_random_uuid()::text, now() + interval '30 days',
               now() - make_interval(days => $2))`,
      [uid, spec.sessionDaysAgo],
    );
  }
  if (spec.crew) {
    const crewId = randomUUID();
    await q('INSERT INTO crews (id, name) VALUES ($1, $2)', [crewId, 'Crew']);
    await q('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, uid]);
  }
  return uid;
}

async function exists(uid: string): Promise<{ users: number; auth: number; keys: number }> {
  return {
    users: await count('FROM users WHERE id = $1', [uid]),
    auth: await count('FROM auth."user" WHERE id = $1', [uid]),
    keys: await count('FROM device_action_keys WHERE user_id = $1', [uid]),
  };
}

describe('maint.anon_gc', () => {
  it('deletes only anonymous accounts inactive 90 days with no crew and no purchase', async () => {
    const stale = await seedAccount({ inactiveDays: 120, sessionDaysAgo: 100 });
    const recentSession = await seedAccount({ inactiveDays: 120, sessionDaysAgo: 10 });
    const inCrew = await seedAccount({ inactiveDays: 120, crew: true });
    const purchased = await seedAccount({ inactiveDays: 120, purchase: true });
    const registered = await seedAccount({ inactiveDays: 120, anonymous: false });
    const young = await seedAccount({ inactiveDays: 30 });

    const report = await collectAnonymousAccounts(harness.pool, silent);
    expect(report).toEqual({ deleted: 1, kept: 0, failed: 0 });

    expect(await exists(stale)).toEqual({ users: 0, auth: 0, keys: 0 });
    expect(await count('FROM user_settings WHERE user_id = $1', [stale])).toBe(0);
    expect(await count('FROM auth.session WHERE user_id = $1', [stale])).toBe(0);
    expect(await count('FROM devices WHERE user_id = $1', [stale])).toBe(0);
    expect(await count('FROM notifications WHERE user_id = $1', [stale])).toBe(0);
    expect(await count("FROM push_tokens WHERE token = 'token-' || $1", [stale])).toBe(0);
    for (const kept of [recentSession, inCrew, purchased, registered, young]) {
      expect(await exists(kept)).toEqual({ users: 1, auth: 1, keys: 1 });
      expect(await count('FROM devices WHERE user_id = $1', [kept])).toBe(1);
    }
    expect(await collectAnonymousAccounts(harness.pool, silent)).toEqual({
      deleted: 0,
      kept: 0,
      failed: 0,
    });
  });
});
