/**
 * `verify_sender_email` (doc delta, "Link this email?"): a crew member enters the 6-digit code the
 * crew address sent back to an unknown sender. The matching sender is linked to their account, so
 * their forwards are accepted from now on, and the crew's quarantined mail from it is released to
 * the parser. Wrong codes are limited to 5 an hour per member and 20 per crew; codes live 24 hours.
 */
import { emitEvent, sendInTx } from '@cp/db';
import { BOOKINGS_QUEUES, DomainError } from '@cp/domain';
import { z } from 'zod';

import { checkRateLimit, type RateLimitRedisClient } from '../../abuse/rate-limits';
import { asSystemRole } from '../../admin/command';
import { refreshHeldMail } from '../../bookings/held-mail';
import { linkCodeHash } from '../../routes/webhooks/inbound-email';
import { defineCommand } from '../_framework/define-command';
import { requireActiveMember } from '../crews/shared';

const verifySenderEmailPayloadSchema = z.object({
  crew_id: z.uuid(),
  code: z.string().regex(/^\d{6}$/u),
});

export interface VerifySenderDeps {
  readonly pepper: string;
  readonly redis: RateLimitRedisClient;
}

export interface VerifySenderResult {
  readonly crew_id: string;
  readonly released: number;
}

export function createVerifySenderEmailCommand(deps: VerifySenderDeps) {
  return defineCommand({
    name: 'verify_sender_email',
    v: 1,
    schema: verifySenderEmailPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await requireActiveMember(tx, payload.crew_id, ctx.uid);
      for (const [key, max] of [
        [`bookings:link-code:user:${ctx.uid}`, 5],
        [`bookings:link-code:crew:${payload.crew_id}`, 20],
      ] as const) {
        const decision = await checkRateLimit(deps.redis, key, { windowSeconds: 3_600, max });
        if (!decision.allowed) {
          throw new DomainError('RATE_LIMITED', { retry_after_s: decision.retryAfterS });
        }
      }
    },
    handle: async (tx, payload, ctx): Promise<VerifySenderResult> => {
      const now = ctx.clock.serverNow;
      const linked = await asSystemRole(tx, async () => {
        const { rows } = await tx.query<{ sender_hash: string }>(
          `UPDATE inbound_sender_links
              SET user_id = $3, verified_at = $4, code_hash = NULL, code_expires_at = NULL
            WHERE crew_id = $1 AND code_hash = $2 AND code_expires_at > $4 AND verified_at IS NULL
            RETURNING sender_hash`,
          [payload.crew_id, linkCodeHash(payload.crew_id, payload.code, deps.pepper), ctx.uid, now],
        );
        if (rows.length === 0) return null;
        const released = await tx.query<{ id: string }>(
          `UPDATE inbound_emails
              SET status = 'accepted', quarantine_reason = NULL, user_id = $3
            WHERE crew_id = $1 AND sender_hash = ANY($2) AND status = 'quarantined'
              AND quarantine_reason = 'unknown_sender'
            RETURNING id`,
          [payload.crew_id, rows.map((row) => row.sender_hash), ctx.uid],
        );
        await refreshHeldMail(tx, payload.crew_id);
        return released.rows.map((row) => row.id);
      });
      if (linked === null) throw new DomainError('CODE_INVALID', { reason: 'link_code' });
      for (const id of linked) {
        await sendInTx(
          tx,
          BOOKINGS_QUEUES.mailParse,
          { inbound_email_id: id },
          { singletonKey: id },
        );
      }
      await emitEvent(tx, {
        type: 'import.sender_linked',
        aggregateKind: 'crew',
        aggregateId: payload.crew_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: payload.crew_id,
        payload: { crew_id: payload.crew_id, user_id: ctx.uid },
      });
      return { crew_id: payload.crew_id, released: linked.length };
    },
  });
}
