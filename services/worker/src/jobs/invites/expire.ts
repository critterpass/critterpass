/**
 * `maint.codes` (hourly, docs/api-contracts-async.md §2.3): open invites past their expiry become
 * `expired`; crew, trip and referral codes past theirs stop resolving (and `og.render` purges their
 * cached share cards); invite prefill is purged 7
 * days after its invite is claimed, declined, revoked or expired; answered invites go 90 days
 * after they closed (their opens and prefill with them, referrals keep only their own row).
 */
import { sendInTx, withSystem } from '@cp/db';
import { OG_RENDER_QUEUE, ogRenderSingletonKey, type OgRenderJob } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const PREFILL_RETENTION_DAYS = 7;
export const CLOSED_INVITE_RETENTION_DAYS = 90;

export interface CodeExpiryReport {
  readonly invitesExpired: number;
  readonly codesExpired: number;
  readonly prefillPurged: number;
  readonly invitesPurged: number;
}

export async function expireInvitesAndCodes(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<CodeExpiryReport> {
  return withSystem(pool, async (tx) => {
    const invites = await tx.query(
      `UPDATE invites SET status = 'expired'
        WHERE status IN ('pending', 'later') AND expires_at <= $1`,
      [now],
    );
    const codes = await tx.query<{ code: string; target_kind: string }>(
      `UPDATE join_codes SET status = 'expired'
        WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= $1
        RETURNING code, target_kind`,
      [now],
    );
    for (const row of codes.rows) {
      const job: OgRenderJob = {
        kind: row.target_kind === 'referral' ? 'referral' : 'invite',
        token: row.code,
      };
      await sendInTx(tx, OG_RENDER_QUEUE, job, { singletonKey: ogRenderSingletonKey(job) });
    }
    const prefill = await tx.query(
      `DELETE FROM invite_prefill p USING invites i
        WHERE i.id = p.invite_id
          AND i.status IN ('claimed', 'waitlisted', 'declined', 'revoked', 'expired')
          AND CASE i.status
                WHEN 'expired' THEN i.expires_at
                WHEN 'claimed' THEN coalesce(i.claimed_at, i.updated_at)
                WHEN 'waitlisted' THEN coalesce(i.claimed_at, i.updated_at)
                ELSE i.updated_at
              END <= $1::timestamptz - make_interval(days => $2)`,
      [now, PREFILL_RETENTION_DAYS],
    );
    const purged = await tx.query(
      `DELETE FROM invites
        WHERE status IN ('claimed', 'declined', 'revoked', 'expired')
          AND updated_at <= $1::timestamptz - make_interval(days => $2)
          AND NOT EXISTS (SELECT 1 FROM seat_waitlist_offers o
                           WHERE o.invite_id = invites.id AND o.status = 'offered')`,
      [now, CLOSED_INVITE_RETENTION_DAYS],
    );
    return {
      invitesExpired: invites.rowCount ?? 0,
      codesExpired: codes.rowCount ?? 0,
      prefillPurged: prefill.rowCount ?? 0,
      invitesPurged: purged.rowCount ?? 0,
    };
  });
}

export function codeExpiryJob(): AnyJobDefinition {
  return defineJob({
    queue: 'maint.codes',
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await expireInvitesAndCodes(pool)) };
    },
  });
}
