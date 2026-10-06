/**
 * The external purge and the purge reminder against a real migrated Postgres and a real job
 * runtime: a purged account is handed on and erased from every store, an account that is only
 * closed is never touched, and the reminder finds exactly the accounts three days from their purge.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { purgeDueAccounts } from '../../src/jobs/account/purge';
import {
  accountPurgeExternalJob,
  enqueueRecentExternalPurges,
  isPurged,
} from '../../src/jobs/account/purge-external';
import { remindDuePurges } from '../../src/jobs/account/purge-reminder';
import { silent, startJobsHarness, until, type JobsHarness } from '../helpers/jobs-harness';
import { PURGE_UID, vendorDouble, type VendorDouble } from './purge-vendors';

let harness: JobsHarness;
let vendors: VendorDouble;
const q = (sql: string, params: unknown[] = []) => harness.pool.query(sql, params);

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness.close();
});

beforeEach(() => {
  vendors = vendorDouble();
  vi.stubGlobal('fetch', vendors.fetch);
});

afterEach(async () => {
  await harness.stopAll();
  vi.unstubAllGlobals();
});

/** A closed account whose purge is `purgeIn` away (negative = due); answers its deletion id. */
async function closed(uid: string, purgeIn: string): Promise<string> {
  await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'closed', 'Mai')", [uid]);
  const { rows } = await q(
    `INSERT INTO account_deletions (user_id, purge_at, source)
     VALUES ($1, now() + $2::interval, 'app') RETURNING id`,
    [uid, purgeIn],
  );
  return (rows[0] as { id: string }).id;
}

async function externalJobs(uid: string): Promise<{ state: string; output: unknown }[]> {
  const { rows } = await q(
    `SELECT state::text AS state, output FROM pgboss.job
      WHERE name = 'account.purge_external' AND data->>'user_id' = $1`,
    [uid],
  );
  return rows as { state: string; output: unknown }[];
}

describe('account.purge_external', () => {
  it('erases a purged account from every store and leaves a closed one alone', async () => {
    const waiting = randomUUID();
    const deletionId = await closed(PURGE_UID, '-1 hour');
    const waitingDeletion = await closed(waiting, '12 days');
    await harness.startRuntime([accountPurgeExternalJob(vendors.stores())]);

    expect(await purgeDueAccounts(harness.pool, silent)).toEqual({ purged: 1, failed: 0 });
    expect(await isPurged(harness.pool, PURGE_UID, deletionId)).toBe(true);
    expect(await isPurged(harness.pool, waiting, waitingDeletion)).toBe(false);

    expect(await withSystem(harness.pool, (tx) => enqueueRecentExternalPurges(tx))).toBe(1);
    await until(
      async () => (await externalJobs(PURGE_UID)).some((job) => job.state === 'completed'),
      15_000,
    );
    const [job] = await externalJobs(PURGE_UID);
    expect(job?.output).toMatchObject({
      media: 'erased',
      analytics: 'erased',
      ai_traces: 'erased',
    });
    expect(await externalJobs(waiting)).toEqual([]);
    expect(vendors.calls.filter((call) => call.startsWith('DELETE'))).toHaveLength(5);
    expect(vendors.calls.join(' ')).not.toContain(waiting);
  });
});

describe('account.purge_reminder', () => {
  it('finds the accounts two to three days from their purge, once', async () => {
    const soon = randomUUID();
    const later = randomUUID();
    const tomorrow = randomUUID();
    const restored = randomUUID();
    await closed(soon, '2 days 12 hours');
    await closed(later, '9 days');
    await closed(tomorrow, '1 day');
    const restoredDeletion = await closed(restored, '2 days 12 hours');
    await q('UPDATE account_deletions SET restored_at = now() WHERE id = $1', [restoredDeletion]);

    const reminded: string[] = [];
    const report = await remindDuePurges(harness.pool, silent, (reminder) => {
      reminded.push(reminder.userId);
      return Promise.resolve(true);
    });
    expect(reminded).toEqual([soon]);
    expect(report).toEqual({ due: 1, delivered: 1, undelivered: 0, failed: 0 });

    // With nothing able to reach a closed account, the reminder is counted, not lost silently.
    expect(await remindDuePurges(harness.pool, silent, null)).toEqual({
      due: 1,
      delivered: 0,
      undelivered: 1,
      failed: 0,
    });
    // A day later the same account is outside the window: it is found on one daily run only.
    const nextDay = new Date(Date.now() + 86_400_000);
    expect((await remindDuePurges(harness.pool, silent, null, nextDay)).due).toBe(0);
  });
});
