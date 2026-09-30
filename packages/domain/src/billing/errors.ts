/**
 * Detail shapes of the billing refusals (docs/api-contracts.md §3): who holds a trip's boost lock
 * and until when, and the `STATE_INVALID` reasons billing commands answer with, so the app maps
 * each one to its own copy.
 */
import { z } from 'zod';

export const boostIntentLockedDetailSchema = z.object({
  by_uid: z.uuid(),
  until: z.iso.datetime({ offset: true }),
});
export type BoostIntentLockedDetail = z.infer<typeof boostIntentLockedDetailSchema>;

export const BILLING_STATE_REASONS = [
  /** The trip already has a live boost (or FTF / crew-year coverage). */
  'already_boosted',
  /** The trip is over (after its end), cancelled or archived. */
  'trip_ended',
  /** The intent is no longer open (fulfilled, lapsed or cancelled). */
  'intent_closed',
  /** The store has no record of this transaction for this account. */
  'transaction_unverified',
  /** Store verification is not configured on this server (no RevenueCat key). */
  'store_unverifiable',
  /** The boost cannot move from its current status. */
  'boost_not_movable',
  /** The crew has no later trip to move a boost to. */
  'no_next_trip',
  /** A boost credit was already spent. */
  'credit_used',
  /** The crew yearly grant was already moved to another crew this period. */
  'rebind_used',
  /** The member already thanked the buyer. */
  'already_thanked',
] as const;
export type BillingStateReason = (typeof BILLING_STATE_REASONS)[number];
