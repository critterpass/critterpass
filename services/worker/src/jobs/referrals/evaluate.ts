/**
 * `referral.evaluate` (every 15 minutes): moves each open referral along. Facts come from what the
 * referee actually did (joined a crew and voted, or organises a trip), whether their identity is
 * verified (a verified phone or a registered Apple / Google account) on an attested install, and
 * the fraud rules (an install the referrer also used, the referrer's 30-day velocity). A qualified
 * referral stamps both people once, each on their own pass, unless `referrals.rewards_paused` is
 * set; a qualified referral whose people have no pass yet is rewarded on a later run. Covers are
 * never stored: the app derives them from the referral stamps a pass holds.
 */
import { appendDomainEvent, withSystem } from '@cp/db';
import {
  evaluateQualification,
  REFERRAL_VELOCITY_WINDOW_DAYS,
  referralRewardRecipients,
  referralVoidReason,
  type ReferralStatus,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

interface OpenReferral {
  readonly id: string;
  readonly referrer_id: string;
  readonly referee_id: string;
  readonly status: ReferralStatus;
  readonly referee_device_id: string | null;
}

interface Facts {
  readonly joined_crew: boolean;
  readonly voted: boolean;
  readonly created_trip: boolean;
  readonly identity_verified: boolean;
  readonly device_attested: boolean;
  readonly shared_device: boolean;
  readonly referrer_qualified: number;
}

async function hasBallots(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ found: boolean }>(
    "SELECT to_regclass('public.ballots') IS NOT NULL AS found",
  );
  return rows[0]?.found === true;
}

async function factsFor(tx: pg.PoolClient, referral: OpenReferral): Promise<Facts> {
  const voted = (await hasBallots(tx))
    ? `EXISTS (SELECT 1 FROM ballots b WHERE b.user_id = $1)`
    : 'false';
  const { rows } = await tx.query<Facts>(
    `SELECT
       EXISTS (SELECT 1 FROM crew_members WHERE user_id = $1 AND status = 'active') AS joined_crew,
       ${voted} AS voted,
       EXISTS (SELECT 1 FROM trip_participants WHERE user_id = $1 AND role = 'organiser')
         AS created_trip,
       (EXISTS (SELECT 1 FROM user_private WHERE user_id = $1 AND phone_hash IS NOT NULL)
         OR EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'registered'))
         AS identity_verified,
       EXISTS (SELECT 1 FROM device_attestations a
                WHERE a.install_id = $3
                   OR a.install_id IN (SELECT d.id FROM devices d WHERE d.user_id = $1))
         AS device_attested,
       ($3::uuid IS NOT NULL AND (
          EXISTS (SELECT 1 FROM devices d WHERE d.id = $3 AND d.user_id = $2)
          OR EXISTS (SELECT 1 FROM device_action_keys k WHERE k.device_id = $3 AND k.user_id = $2)
       )) AS shared_device,
       (SELECT count(*)::int FROM referrals r
         WHERE r.referrer_id = $2 AND r.status = 'qualified' AND r.id <> $4
           AND r.qualified_at > now() - make_interval(days => $5)) AS referrer_qualified`,
    [
      referral.referee_id,
      referral.referrer_id,
      referral.referee_device_id,
      referral.id,
      REFERRAL_VELOCITY_WINDOW_DAYS,
    ],
  );
  const facts = rows[0];
  if (facts === undefined) throw new Error('referral facts query returned no row');
  return facts;
}

async function setStatus(
  tx: pg.PoolClient,
  referral: OpenReferral,
  status: ReferralStatus,
  voidReason: string | null,
): Promise<void> {
  if (status === referral.status) return;
  await tx.query(
    `UPDATE referrals SET status = $2, void_reason = $3,
       qualified_at = CASE WHEN $2 = 'qualified' THEN now() ELSE qualified_at END
     WHERE id = $1`,
    [referral.id, status, voidReason],
  );
  await appendDomainEvent(tx, {
    type: 'referral.progressed',
    aggregateKind: 'referral',
    aggregateId: referral.id,
    actorKind: 'system',
    actorId: null,
    payload: { referral_id: referral.id, status },
  });
}

async function rewardsPaused(tx: pg.PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ value: unknown }>(
    "SELECT value FROM ops.ops_config WHERE key = 'referrals.rewards_paused'",
  );
  return rows[0]?.value === true;
}

/** Stamps both people of a qualified, unrewarded referral once; false while a pass is missing. */
async function reward(tx: pg.PoolClient, referralId: string): Promise<boolean> {
  const { rows } = await tx.query<{ referrer_id: string; referee_id: string }>(
    `SELECT referrer_id, referee_id FROM referrals
      WHERE id = $1 AND status = 'qualified' AND reward_kind IS NULL FOR UPDATE`,
    [referralId],
  );
  const referral = rows[0];
  if (referral === undefined) return false;
  const people = referralRewardRecipients({
    referrerId: referral.referrer_id,
    refereeId: referral.referee_id,
  });
  const { rows: passes } = await tx.query<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM passes WHERE user_id = ANY($1::uuid[])',
    [people],
  );
  if (passes.length < people.length) return false;
  let referrerStamp: string | null = null;
  for (const uid of people) {
    const pass = passes.find((row) => row.user_id === uid);
    if (pass === undefined) return false;
    const { rows: stamp } = await tx.query<{ id: string }>(
      `INSERT INTO stamps (pass_id, user_id, kind, seq_no, status, stamped_at)
       VALUES ($1, $2, 'referral',
         (SELECT coalesce(max(seq_no), 0) + 1 FROM stamps WHERE user_id = $2), 'stamped', now())
       RETURNING id`,
      [pass.id, uid],
    );
    if (uid === referral.referrer_id) referrerStamp = stamp[0]?.id ?? null;
  }
  await tx.query(`UPDATE referrals SET reward_kind = 'stamp', reward_ref = $2 WHERE id = $1`, [
    referralId,
    referrerStamp,
  ]);
  return true;
}

export interface ReferralRun {
  readonly evaluated: number;
  readonly qualified: number;
  readonly voided: number;
  readonly rewarded: number;
}

export async function evaluateReferrals(pool: pg.Pool): Promise<ReferralRun> {
  return withSystem(pool, async (tx) => {
    const { rows: open } = await tx.query<OpenReferral>(
      `SELECT id, referrer_id, referee_id, status, referee_device_id FROM referrals
        WHERE status IN ('pending', 'joined') ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED`,
    );
    let qualified = 0;
    let voided = 0;
    for (const referral of open) {
      const facts = await factsFor(tx, referral);
      const voidReason = referralVoidReason({
        sharedDevice: facts.shared_device,
        identitySeenBefore: false,
        referrerQualifiedInWindow: facts.referrer_qualified,
      });
      const outcome = evaluateQualification({
        identityVerified: facts.identity_verified,
        identitySeenBefore: false,
        deviceAttested: facts.device_attested,
        joinedCrew: facts.joined_crew,
        voted: facts.voted,
        createdTrip: facts.created_trip,
      });
      // Velocity only bites on a referral that would otherwise qualify now.
      if (voidReason === 'self_referral' || (voidReason !== null && outcome.kind === 'qualified')) {
        await setStatus(tx, referral, 'void', voidReason);
        voided += 1;
        continue;
      }
      if (outcome.kind === 'qualified') {
        await setStatus(tx, referral, 'qualified', null);
        qualified += 1;
      } else if (outcome.kind === 'joined') {
        await setStatus(tx, referral, 'joined', null);
      }
    }
    let rewarded = 0;
    if (!(await rewardsPaused(tx))) {
      const { rows: due } = await tx.query<{ id: string }>(
        `SELECT id FROM referrals WHERE status = 'qualified' AND reward_kind IS NULL
          ORDER BY qualified_at LIMIT 500`,
      );
      for (const row of due) if (await reward(tx, row.id)) rewarded += 1;
    }
    return { evaluated: open.length, qualified, voided, rewarded };
  });
}

export function referralEvaluateJob(): AnyJobDefinition {
  return defineJob({
    queue: 'referral.evaluate',
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await evaluateReferrals(pool)) };
    },
  });
}
