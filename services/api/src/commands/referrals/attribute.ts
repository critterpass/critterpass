/**
 * Referral attribution. The first valid invite link or code a brand-new account comes through
 * names its referrer (every invite carries its inviter), and a referral link (`/r/{code}`) does the
 * same without joining a crew (`attribute_referral`). Later links change nothing; an established
 * account and self-referral never attribute. The referee's install is kept for the fraud checks
 * and is never visible to either party.
 */
import { appendDomainEvent } from '@cp/db';
import {
  canAttributeReferral,
  DomainError,
  normalizeJoinCode,
  type CommandContext,
  type ReferralVia,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineCommand } from '../_framework/define-command';

export interface AttributionInput {
  readonly referrerId: string;
  readonly via: ReferralVia;
  /** `joined` when the attribution comes with a crew join. */
  readonly status: 'pending' | 'joined';
  readonly inviteId: string | null;
  readonly code: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Attributes the caller to `referrerId` when eligible; returns the referral id, or null. */
export async function attributeReferral(
  tx: pg.PoolClient,
  ctx: CommandContext,
  input: AttributionInput,
): Promise<string | null> {
  const { rows } = await tx.query<{ created_at: Date; referred: boolean }>(
    `SELECT u.created_at,
            EXISTS (SELECT 1 FROM referrals r WHERE r.referee_id = u.id) AS referred
       FROM users u WHERE u.id = $1`,
    [ctx.uid],
  );
  const me = rows[0];
  if (me === undefined) return null;
  const eligible = canAttributeReferral({
    referrerId: input.referrerId,
    refereeId: ctx.uid,
    refereeCreatedAt: me.created_at,
    refereeAlreadyReferred: me.referred,
    now: ctx.clock.serverNow,
  });
  if (!eligible) return null;
  const { rows: created } = await tx.query<{ id: string | null }>(
    'SELECT app.record_referral($1, $2, $3, $4, $5, $6) AS id',
    [
      input.referrerId,
      input.via,
      input.status,
      input.inviteId,
      input.code,
      UUID.test(ctx.device.id) ? ctx.device.id : null,
    ],
  );
  const referralId = created[0]?.id ?? null;
  if (referralId === null) return null;
  await appendDomainEvent(tx, {
    type: 'referral.progressed',
    aggregateKind: 'referral',
    aggregateId: referralId,
    actorKind: 'user',
    actorId: ctx.uid,
    payload: { referral_id: referralId, status: input.status },
  });
  return referralId;
}

const attributeReferralPayloadSchema = z.object({ code: z.string().min(1).max(16) });

/** `attribute_referral`: a referral link or typed referral code, after the app's first launch. */
export const attributeReferralCommand = defineCommand({
  name: 'attribute_referral',
  v: 1,
  schema: attributeReferralPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx) => {
    const code = normalizeJoinCode(payload.code);
    if (code === null) throw new DomainError('CODE_INVALID', { reason: 'malformed' });
    const { rows } = await tx.query<{ target_kind: string; target_id: string }>(
      'SELECT target_kind, target_id FROM app.lookup_join_code($1)',
      [code],
    );
    const row = rows[0];
    if (row?.target_kind !== 'referral')
      throw new DomainError('CODE_INVALID', { reason: 'unknown' });
    const referralId = await attributeReferral(tx, ctx, {
      referrerId: row.target_id,
      via: 'referral_link',
      status: 'pending',
      inviteId: null,
      code,
    });
    return { attributed: referralId !== null };
  },
});
