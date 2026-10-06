/**
 * Account deletion in the console: support reads where a traveller's deletion stands (ids, dates
 * and states, never the reason they gave), and only an owner can end a grace window early, which
 * queues the same purge every account goes through and leaves exactly one audit row.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { adminAccountDeletionsResponseSchema, adminUserDeletionSchema } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startJobProducer } from '../../src/jobs/producer';
import { startAdminHarness, type AdminHarness, type TestApp } from './harness';

let harness: AdminHarness;
let app: TestApp;
let boss: PgBoss;
let support: string;
let owner: string;

// One of the reasons the app offers; the console never shows which one a traveller picked.
const PRIVATE_REASON = 'too_many_pings';

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('owner@critterpass.test', ['owner']);
  boss = await startJobProducer({
    connectionString: String(
      (harness.pool.options as { connectionString: string }).connectionString,
    ),
    logger: { error: () => undefined },
  });
  if ((await boss.getQueue('account.purge')) === null) {
    await boss.createQueue('account.purge', { policy: 'stately' });
  }
  app = harness.app({ areas: harness.areas() });
  support = await app.signIn('support@critterpass.test');
  owner = await app.signIn('owner@critterpass.test');
}, 240_000);

afterAll(async () => {
  await boss?.stop();
  await app?.close();
  await harness?.stop();
});

/** A traveller; `purgeInDays` closes the account with a purge that many days away. */
async function traveller(purgeInDays?: number): Promise<string> {
  const uid = randomUUID();
  await withSystem(harness.pool, async (tx) => {
    await tx.query('INSERT INTO users (id, status, display_name) VALUES ($1, $2, $3)', [
      uid,
      purgeInDays === undefined ? 'registered' : 'closed',
      'Mai',
    ]);
    if (purgeInDays !== undefined) {
      await tx.query(
        `INSERT INTO account_deletions (user_id, purge_at, source, reason)
         VALUES ($1, now() + make_interval(days => $2), 'app', $3)`,
        [uid, purgeInDays, PRIVATE_REASON],
      );
      await tx.query(
        'UPDATE users SET purge_at = now() + make_interval(days => $2) WHERE id = $1',
        [uid, purgeInDays],
      );
    }
  });
  return uid;
}

async function get(path: string, cookie: string) {
  const response = await app.request(path, { headers: { cookie } });
  return { status: response.status, text: await response.text() };
}

async function audits(uid: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ops.admin_audit
      WHERE target_id = $1 AND action = 'force_purge_account'`,
    [uid],
  );
  return rows[0]?.n ?? 0;
}

async function queuedPurges(uid: string): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pgboss.job
      WHERE name = 'account.purge' AND data->>'user_id' = $1`,
    [uid],
  );
  return rows[0]?.n ?? 0;
}

describe('account deletion in the console', () => {
  it('shows support where a deletion stands, without the reason the traveller gave', async () => {
    const closed = await traveller(12);
    const open = await traveller();

    const detail = await get(`/v1/admin/users/${closed}/deletion`, support);
    expect(detail.status).toBe(200);
    expect(detail.text).not.toContain(PRIVATE_REASON);
    const parsed = adminUserDeletionSchema.parse(JSON.parse(detail.text));
    expect(parsed.state).toBe('requested');
    expect(parsed.deletions).toHaveLength(1);
    expect(parsed.last_export).toBeNull();

    const none = await get(`/v1/admin/users/${open}/deletion`, support);
    expect(adminUserDeletionSchema.parse(JSON.parse(none.text))).toEqual({
      state: 'none',
      deletions: [],
      last_export: null,
    });

    const list = await get('/v1/admin/account-deletions?state=requested', support);
    expect(list.text).not.toContain(PRIVATE_REASON);
    const uids = adminAccountDeletionsResponseSchema
      .parse(JSON.parse(list.text))
      .items.map((item) => item.uid);
    expect(uids).toContain(closed);
    expect(uids).not.toContain(open);
  });

  it('lets only an owner end the grace window, and queues the purge once', async () => {
    const uid = await traveller(20);

    const denied = await app.command(support, 'force_purge_account', {
      uid,
      reason: 'Erasure request by post',
    });
    expect(denied.status).toBe(403);
    expect(await queuedPurges(uid)).toBe(0);
    expect(await audits(uid)).toBe(0);

    const forced = await app.command(owner, 'force_purge_account', {
      uid,
      reason: 'Erasure request by post',
    });
    expect(forced.status).toBe(200);
    const { rows } = await harness.pool.query<{ due: boolean; user_due: boolean }>(
      `SELECT d.purge_at <= now() AS due, u.purge_at <= now() AS user_due
         FROM account_deletions d JOIN users u ON u.id = d.user_id WHERE d.user_id = $1`,
      [uid],
    );
    expect(rows).toEqual([{ due: true, user_due: true }]);
    expect(await queuedPurges(uid)).toBe(1);
    expect(await audits(uid)).toBe(1);
  });

  it('refuses an account that is not closed, and one that does not exist', async () => {
    const open = await traveller();
    const refused = await app.command(owner, 'force_purge_account', {
      uid: open,
      reason: 'Erasure request by post',
    });
    expect(refused.status).toBe(409);
    expect(await queuedPurges(open)).toBe(0);
    expect(await audits(open)).toBe(0);

    const missing = await app.command(owner, 'force_purge_account', {
      uid: randomUUID(),
      reason: 'Erasure request by post',
    });
    expect(missing.status).toBe(404);
  });
});
