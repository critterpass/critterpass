/**
 * `referrals`: RLS class O for either party. The referrer and the referee each read the row (its
 * status, never the other side's activity); crewmates, ex-members and strangers see nothing, and
 * only the system writes. The `me` stream mirrors the same two parties.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

function as(uid: string, sql: string, params: unknown[] = []) {
  return withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));
}

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('referrals: either party reads, the system writes', () => {
  it('shows the referral to its referrer and referee only', async () => {
    const { actors } = harness.fixture;
    const sql = 'SELECT status FROM referrals';
    expect((await as(actors.organiser, sql)).rows).toEqual([{ status: 'pending' }]);
    expect((await as(actors.member, sql)).rows).toEqual([{ status: 'pending' }]);
    for (const uid of [actors.coOrganiser, actors.exMember, actors.outsider, actors.anonymous]) {
      expect((await as(uid, sql)).rows).toEqual([]);
    }
  });

  it('refuses every app_user write, including to the referrer', async () => {
    const { actors } = harness.fixture;
    await expect(as(actors.organiser, "UPDATE referrals SET status = 'qualified'")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      as(
        actors.outsider,
        "INSERT INTO referrals (referrer_id, referee_id, via) VALUES ($1, $2, 'code')",
        [actors.organiser, actors.outsider],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('allows one referral per referee and never a self-referral', async () => {
    const { actors } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query("INSERT INTO referrals (referrer_id, referee_id, via) VALUES ($1, $2, 'code')", [
          actors.coOrganiser,
          actors.member,
        ]),
      ),
    ).rejects.toThrow(/duplicate key/i);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query("INSERT INTO referrals (referrer_id, referee_id, via) VALUES ($1, $1, 'code')", [
          actors.outsider,
        ]),
      ),
    ).rejects.toThrow(/referrals_not_self/);
  });

  it('syncs the row to both parties through the me stream and to nobody else', async () => {
    expect((await harness.rows('me', 'organiser')).get('referrals')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('referrals')).toHaveLength(1);
    expect((await harness.rows('me', 'outsider')).get('referrals') ?? []).toEqual([]);
  });
});
