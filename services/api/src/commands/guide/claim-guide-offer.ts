/**
 * `claim_guide_offer` (I'M IN on a guide offer in crew chat): the member's own explicit confirm for
 * one slot. It never books or pays anything (docs/product-decisions.md: bookings go through the
 * supplier's real availability or a link-out, splits through `add_expense`'s own confirm); it only
 * records who is in. Idempotent per member, and the offer's row lock means racing taps can never
 * take more slots than the offer has.
 */
import { outbox } from '@cp/db';
import {
  channelName,
  claimGuideOfferPayloadSchema,
  DomainError,
  type ClaimGuideOfferResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

interface OfferRow {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly status: string;
  readonly slots_taken: number;
  readonly slots_total: number;
  readonly expired: boolean;
}

export const claimGuideOfferCommand = defineCommand({
  name: 'claim_guide_offer',
  v: 1,
  schema: claimGuideOfferPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    // RLS shows an offer to its trip's members only.
    const { rowCount } = await tx.query('SELECT 1 FROM guide_offers WHERE id = $1', [
      payload.offer_id,
    ]);
    if (rowCount === 0) throw new DomainError('NOT_FOUND');
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, async (): Promise<ClaimGuideOfferResult> => {
      const { rows } = await tx.query<OfferRow>(
        `SELECT o.trip_id, t.crew_id, o.status, o.slots_taken, o.slots_total,
                (o.expires_at IS NOT NULL AND o.expires_at <= now()) AS expired
           FROM guide_offers o JOIN trips t ON t.id = o.trip_id
          WHERE o.id = $1 FOR UPDATE OF o`,
        [payload.offer_id],
      );
      const offer = rows[0];
      if (offer === undefined) throw new DomainError('NOT_FOUND');
      const mine = await tx.query(
        'SELECT 1 FROM guide_offer_claims WHERE offer_id = $1 AND user_id = $2',
        [payload.offer_id, ctx.uid],
      );
      if (mine.rowCount !== 0) {
        return {
          offer_id: payload.offer_id,
          already_claimed: true,
          slots_taken: offer.slots_taken,
          slots_total: offer.slots_total,
        };
      }
      if (offer.status !== 'open' || offer.expired || offer.slots_taken >= offer.slots_total) {
        throw new DomainError('STATE_INVALID', {
          state: offer.expired ? 'offer_expired' : 'offer_full',
        });
      }
      await tx.query(
        'INSERT INTO guide_offer_claims (offer_id, trip_id, user_id) VALUES ($1, $2, $3)',
        [payload.offer_id, offer.trip_id, ctx.uid],
      );
      const slotsTaken = offer.slots_taken + 1;
      await outbox(tx, channelName('crew_chat', offer.crew_id), 'guide_offer.taken', {
        offer_id: payload.offer_id,
        user_id: ctx.uid,
        slots_taken: slotsTaken,
        slots_total: offer.slots_total,
      });
      return {
        offer_id: payload.offer_id,
        already_claimed: false,
        slots_taken: slotsTaken,
        slots_total: offer.slots_total,
      };
    }),
});
