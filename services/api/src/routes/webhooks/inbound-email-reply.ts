/**
 * `POST /webhooks/inbound-email/reply` (docs/api-contracts.md §5.8): the Email Worker's signed report
 * on one "Link this email?" reply, `{link_id, delivery: 'sent' | 'failed'}`, signed like the
 * inbound report (registered beside it in ./inbound-email). Cloudflare refuses a reply when the
 * incoming mail has no valid DMARC result or the sender cannot be replied to, and nothing else
 * would tell us. `sent` lets the crew be asked for the code; `failed` clears the code, so the app
 * says no code went out and the sender's next forward issues and tries a new one. Only a `pending`
 * code moves, so a repeated or late report changes nothing.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { refreshHeldMail } from '../../bookings/held-mail';

export const deliveryReportSchema = z.object({
  link_id: z.uuid(),
  delivery: z.enum(['sent', 'failed']),
});
export type DeliveryReport = z.infer<typeof deliveryReportSchema>;

/** Records the reply's delivery on the sender link; `recorded` is false when nothing was pending. */
export async function recordLinkCodeDelivery(
  pool: pg.Pool,
  report: DeliveryReport,
): Promise<{ readonly recorded: boolean }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ crew_id: string }>(
      `UPDATE inbound_sender_links
          SET code_delivery = $2,
              code_hash = CASE WHEN $2 = 'failed' THEN NULL ELSE code_hash END,
              code_expires_at = CASE WHEN $2 = 'failed' THEN NULL ELSE code_expires_at END
        WHERE id = $1 AND code_delivery = 'pending' AND code_hash IS NOT NULL
          AND verified_at IS NULL
        RETURNING crew_id`,
      [report.link_id, report.delivery],
    );
    const crewId = rows[0]?.crew_id;
    if (crewId === undefined) return { recorded: false };
    await refreshHeldMail(tx, crewId);
    return { recorded: true };
  });
}
