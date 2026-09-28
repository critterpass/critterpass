/**
 * `mint_referral_code`: the caller's own referral code (`/r/{code}`), minted once and returned as
 * is afterwards. A referral code points at its creator and belongs to no crew; it does not expire.
 */
import { DomainError } from '@cp/domain';
import { z } from 'zod';

import { defineCommand } from '../_framework/define-command';
import { mintJoinCode } from '../crews/shared';

export const mintReferralCodeCommand = defineCommand({
  name: 'mint_referral_code',
  v: 1,
  schema: z.object({}).strict(),
  offline: false,
  authorize: () => Promise.resolve(),
  handle: async (tx, _payload, ctx) => {
    const { rows } = await tx.query<{ code: string }>(
      `SELECT code FROM join_codes
        WHERE target_kind = 'referral' AND created_by = $1 AND status = 'active'
        ORDER BY created_at DESC LIMIT 1`,
      [ctx.uid],
    );
    const existing = rows[0]?.code;
    if (existing !== undefined) return { code: existing };
    const minted = await mintJoinCode(tx, {
      kind: 'referral',
      ref: ctx.uid,
      expiresAt: null,
      rotate: false,
    });
    if (minted.code.length === 0) throw new DomainError('INTERNAL');
    return { code: minted.code };
  },
});
