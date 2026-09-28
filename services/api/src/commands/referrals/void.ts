/**
 * `void_referral` (system door only: ops and fraud review): voids a referral that has not been
 * rewarded yet, with a reason from the fraud rules. A rewarded referral is never voided here; its
 * stamps stay (rewards are paused with `referrals.rewards_paused`, never clawed back silently).
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, REFERRAL_VOID_REASONS } from '@cp/domain';
import { z } from 'zod';

import { defineCommand } from '../_framework/define-command';

const voidReferralPayloadSchema = z.object({
  referral_id: z.uuid(),
  reason: z.enum(REFERRAL_VOID_REASONS),
});

export const voidReferralCommand = defineCommand({
  name: 'void_referral',
  v: 1,
  schema: voidReferralPayloadSchema,
  offline: false,
  internal: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload) => {
    const { rows } = await tx.query<{ id: string }>(
      `UPDATE referrals SET status = 'void', void_reason = $2
        WHERE id = $1 AND status <> 'void' AND reward_kind IS NULL
        RETURNING id`,
      [payload.referral_id, payload.reason],
    );
    if (rows[0] === undefined) {
      throw new DomainError('STATE_INVALID', { reason: 'not_voidable' });
    }
    await appendDomainEvent(tx, {
      type: 'referral.progressed',
      aggregateKind: 'referral',
      aggregateId: payload.referral_id,
      actorKind: 'system',
      actorId: null,
      payload: { referral_id: payload.referral_id, status: 'void' },
    });
    return { referral_id: payload.referral_id, status: 'void' as const };
  },
});
