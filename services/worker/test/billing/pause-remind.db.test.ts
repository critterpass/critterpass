/**
 * The pause reminder's timer. A week before a planned pause ends, with renewal still off, the
 * member's reminder goes out once as `subscription.resume_due`; a member who turned renewal back
 * on, or who has Pass+ again another way, gets nothing.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { remindPause } from '../../src/jobs/billing/pause-remind';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

const RESUME = new Date('2027-03-01T00:00:00Z');
const DUE = new Date('2027-02-22T00:01:00Z');

async function monthly(row: {
  status: string;
  autoRenew: boolean;
  passPlus?: boolean;
}): Promise<{ uid: string; subscription: string }> {
  return withSystem(harness.pool, async (tx) => {
    const user = await tx.query<{ id: string }>(
      "INSERT INTO users (id, tz) VALUES (uuidv7(), 'Asia/Singapore') RETURNING id",
    );
    const uid = user.rows[0]!.id;
    const sub = await tx.query<{ id: string }>(
      `INSERT INTO subscriptions (user_id, platform, product_key, status, auto_renew, resume_at)
       VALUES ($1, 'app_store', 'pass_monthly', $2, $3, $4) RETURNING id`,
      [uid, row.status, row.autoRenew, RESUME],
    );
    if (row.passPlus === true) {
      await tx.query(
        `INSERT INTO user_entitlements (user_id, pass_plus) VALUES ($1, true)
         ON CONFLICT (user_id) DO UPDATE SET pass_plus = true`,
        [uid],
      );
    }
    return { uid, subscription: sub.rows[0]!.id };
  });
}

async function reminders(subscription: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ payload: unknown }>(
    "SELECT payload FROM domain_events WHERE type = 'subscription.resume_due' AND aggregate_id = $1",
    [subscription],
  );
  return rows.map((row) => row.payload);
}

describe('pause.remind', () => {
  it('reminds a member whose renewal is still off a week before the date', async () => {
    const { uid, subscription } = await monthly({ status: 'expired', autoRenew: false });
    expect(await remindPause(harness.pool, { ref_id: subscription }, DUE)).toBe('reminded');
    expect(await reminders(subscription)).toEqual([
      { user_id: uid, subscription_id: subscription, resume_at: RESUME.toISOString() },
    ]);
  });

  it('sends nothing once renewal is back on', async () => {
    const { subscription } = await monthly({ status: 'active', autoRenew: true });
    expect(await remindPause(harness.pool, { ref_id: subscription }, DUE)).toBe('gone');
    expect(await reminders(subscription)).toEqual([]);
  });

  it('sends nothing when Pass+ is on again another way', async () => {
    const { subscription } = await monthly({
      status: 'expired',
      autoRenew: false,
      passPlus: true,
    });
    expect(await remindPause(harness.pool, { ref_id: subscription }, DUE)).toBe('gone');
    expect(await reminders(subscription)).toEqual([]);
  });

  it('sends nothing for a timer whose subscription is gone', async () => {
    expect(
      await remindPause(harness.pool, { ref_id: '01920000-0000-7000-8000-0000000000aa' }, DUE),
    ).toBe('gone');
  });
});
