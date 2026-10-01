/**
 * Referral attribution through the real command door: a brand-new account joining through an
 * invite or a crew code is attributed to the inviter (first link wins), a referral code attributes
 * without joining, and nobody refers themselves. The referee's install stays out of reach of both
 * parties.
 */
import { randomUUID } from 'node:crypto';

import { withSystem, withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runCommand } from '../location/location-fixture';
import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import { queuedCards, resultOf, startCrew, startInviteHarness } from './invite-fixture';

let harness: CommandDoorsHarness;
let inviter: SignedIn;

beforeAll(async () => {
  harness = await startInviteHarness();
  inviter = await harness.signInAnonymously();
  await harness.promoteToRegistered(inviter.uid);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function referralOf(uid: string) {
  const { rows } = await harness.pool.query<{ referrer_id: string; via: string; status: string }>(
    'SELECT referrer_id, via, status FROM referrals WHERE referee_id = $1',
    [uid],
  );
  return rows;
}

describe('referral attribution', () => {
  it('attributes a new account to the first invite it joins through, and only that one', async () => {
    const crew = await startCrew(harness, inviter);
    const created = await runCommand(harness, inviter, 'create_invite', {
      crew_id: crew,
      channel: 'code',
    });
    const { code } = resultOf(created.body) as { code: string };
    const joiner = await harness.signInAnonymously();
    await runCommand(harness, joiner, 'accept_invite', { code });
    expect(await referralOf(joiner.uid)).toEqual([
      { referrer_id: inviter.uid, via: 'code', status: 'joined' },
    ]);

    const other = await harness.signInAnonymously();
    await harness.promoteToRegistered(other.uid);
    const otherCrew = await startCrew(harness, other);
    const second = await runCommand(harness, other, 'create_invite', {
      crew_id: otherCrew,
      channel: 'code',
    });
    await runCommand(harness, joiner, 'accept_invite', {
      code: (resultOf(second.body) as { code: string }).code,
    });
    expect(await referralOf(joiner.uid)).toEqual([
      { referrer_id: inviter.uid, via: 'code', status: 'joined' },
    ]);
  });

  it('attributes through a referral code without joining any crew, never to oneself', async () => {
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO join_codes (code, target_kind, target_id, created_by)
         VALUES ('REFR23', 'referral', $1, $1)`,
        [inviter.uid],
      ),
    );
    const newcomer = await harness.signInAnonymously();
    const attributed = await runCommand(harness, newcomer, 'attribute_referral', {
      code: 'refr23',
    });
    expect(resultOf(attributed.body)).toEqual({ attributed: true });
    expect(await referralOf(newcomer.uid)).toEqual([
      { referrer_id: inviter.uid, via: 'referral_link', status: 'pending' },
    ]);

    const self = await runCommand(harness, inviter, 'attribute_referral', { code: 'REFR23' });
    expect(resultOf(self.body)).toEqual({ attributed: false });
    const crewCode = await runCommand(harness, newcomer, 'attribute_referral', { code: 'ZZZZ22' });
    expect(crewCode.status).toBe(422);
  });

  it('mints one referral code per person and hands the same one back', async () => {
    const sharer = await harness.signInAnonymously();
    await harness.promoteToRegistered(sharer.uid);
    const first = resultOf((await runCommand(harness, sharer, 'mint_referral_code', {})).body);
    const again = resultOf((await runCommand(harness, sharer, 'mint_referral_code', {})).body);
    expect(first['code']).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/u);
    expect(again).toEqual(first);
    expect(
      (await queuedCards(harness)).filter((card) => card.token === String(first['code'])),
    ).toEqual([{ kind: 'referral', token: first['code'] }]);
    const newcomer = await harness.signInAnonymously();
    const attributed = await runCommand(harness, newcomer, 'attribute_referral', {
      code: String(first['code']),
    });
    expect(resultOf(attributed.body)).toEqual({ attributed: true });
  });

  it('keeps the referee install unreadable by either party', async () => {
    const newcomer = await harness.signInAnonymously();
    await runCommand(harness, newcomer, 'attribute_referral', { code: 'REFR23' });
    for (const uid of [inviter.uid, newcomer.uid]) {
      await expect(
        withUser(harness.pool, uid, randomUUID(), (tx) =>
          tx.query('SELECT referee_device_id FROM referrals'),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
