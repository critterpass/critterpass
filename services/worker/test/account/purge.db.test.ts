/**
 * `account.purge` against a real migrated Postgres: the hourly run erases every closed account
 * whose date has come and nothing else, so an account still in its grace window, a restored one
 * and an open one are all left exactly as they were.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { purgeDueAccounts } from '../../src/jobs/account/purge';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const q = (sql: string, params: unknown[] = []) => harness.pool.query(sql, params);

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness.close();
});

/** A named user; `purgeIn` closes the account with a purge that many days away (negative = due). */
async function user(name: string, purgeIn?: number, restored = false): Promise<string> {
  const uid = randomUUID();
  await q('INSERT INTO users (id, status, display_name) VALUES ($1, $2, $3)', [
    uid,
    purgeIn === undefined || restored ? 'registered' : 'closed',
    name,
  ]);
  await q('INSERT INTO user_settings (user_id) VALUES ($1)', [uid]);
  if (purgeIn !== undefined) {
    await q(
      `INSERT INTO account_deletions (user_id, purge_at, source, restored_at)
       VALUES ($1, now() + make_interval(days => $2), 'app', $3)`,
      [uid, purgeIn, restored ? new Date() : null],
    );
  }
  return uid;
}

async function nameOf(uid: string): Promise<{ status: string; display_name: string | null }> {
  const { rows } = await q('SELECT status, display_name FROM users WHERE id = $1', [uid]);
  return rows[0] as { status: string; display_name: string | null };
}

describe('account.purge', () => {
  it('erases the accounts that are due and leaves every other one alone', async () => {
    const due = await user('Due', -1);
    const inGrace = await user('Grace', 12);
    const restored = await user('Restored', -1, true);
    const open = await user('Open');

    const report = await purgeDueAccounts(harness.pool, silent);
    expect(report).toEqual({ purged: 1, failed: 0 });

    expect(await nameOf(due)).toEqual({ status: 'purged', display_name: null });
    const settings = await q('SELECT 1 FROM user_settings WHERE user_id = $1', [due]);
    expect(settings.rowCount).toBe(0);
    expect(await nameOf(inGrace)).toEqual({ status: 'closed', display_name: 'Grace' });
    expect(await nameOf(restored)).toEqual({ status: 'registered', display_name: 'Restored' });
    expect(await nameOf(open)).toEqual({ status: 'registered', display_name: 'Open' });

    // Nothing is left to do: the next run finds no one.
    expect(await purgeDueAccounts(harness.pool, silent)).toEqual({ purged: 0, failed: 0 });
  });

  it('purges only the account a job names, and only once its date has come', async () => {
    const named = await user('Named', -1);
    const other = await user('Other', -1);
    const early = await user('Early', 5);

    expect(await purgeDueAccounts(harness.pool, silent, early)).toEqual({ purged: 0, failed: 0 });
    expect(await purgeDueAccounts(harness.pool, silent, named)).toEqual({ purged: 1, failed: 0 });
    expect((await nameOf(named)).status).toBe('purged');
    expect((await nameOf(other)).status).toBe('closed');
    expect((await nameOf(early)).status).toBe('closed');
  });
});
