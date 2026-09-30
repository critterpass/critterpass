/**
 * The supplier order state machine (docs/data-model-sync-and-privacy.md §3.5): one table the
 * command handlers, jobs and the `supplier_orders` transition trigger all follow. Viator is the
 * merchant of record: we hold, the payer pays in Viator's own form, Viator confirms.
 *
 * Doc delta: `released` (the holder let the hold go before it lapsed) and `hold_expired` are the
 * two ends of a hold nobody booked; `cancel_requested` falls back to `confirmed` when the supplier
 * declines the cancellation.
 */
import { z } from 'zod';

import { DomainError } from '../errors';

export const SUPPLIER_ORDER_STATUSES = [
  'cart_draft',
  'holding',
  'hold_not_provided',
  'awaiting_payment',
  'payment_failed',
  'booking',
  'pending_operator',
  'confirmed',
  'rejected',
  'cancel_requested',
  'cancelled',
  'hold_expired',
  'released',
] as const;
export const supplierOrderStatusSchema = z.enum(SUPPLIER_ORDER_STATUSES);
export type SupplierOrderStatus = z.infer<typeof supplierOrderStatusSchema>;

export const SUPPLIER_ORDER_TRANSITIONS: Readonly<
  Record<SupplierOrderStatus, readonly SupplierOrderStatus[]>
> = {
  cart_draft: ['holding', 'hold_not_provided', 'rejected'],
  holding: ['awaiting_payment', 'booking', 'hold_expired', 'released'],
  hold_not_provided: ['awaiting_payment', 'booking', 'hold_expired', 'released'],
  awaiting_payment: ['booking', 'payment_failed', 'hold_expired', 'released'],
  payment_failed: ['awaiting_payment', 'booking', 'hold_expired', 'released'],
  booking: ['confirmed', 'pending_operator', 'rejected'],
  pending_operator: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['cancel_requested', 'cancelled'],
  cancel_requested: ['cancelled', 'confirmed'],
  rejected: [],
  cancelled: [],
  hold_expired: [],
  released: [],
};

/** States in which a hold (or a price) is still ours to book or let go. */
export const OPEN_HOLD_STATUSES = [
  'holding',
  'hold_not_provided',
  'awaiting_payment',
  'payment_failed',
] as const satisfies readonly SupplierOrderStatus[];

export function isOpenHold(status: SupplierOrderStatus): boolean {
  return (OPEN_HOLD_STATUSES as readonly SupplierOrderStatus[]).includes(status);
}

export function canTransition(from: SupplierOrderStatus, to: SupplierOrderStatus): boolean {
  return SUPPLIER_ORDER_TRANSITIONS[from].includes(to);
}

/** `STATE_INVALID` with the current state when `to` is not a legal next state. */
export function assertTransition(from: SupplierOrderStatus, to: SupplierOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError('STATE_INVALID', { state: from, to });
  }
}

/** Viator's per-item answer after `/bookings/cart/book` or a status poll. */
export type SupplierBookingOutcome = 'confirmed' | 'pending' | 'rejected' | 'cancelled' | 'failed';

/** Where an order in `booking`/`pending_operator` goes for a supplier answer; null = stay. */
export function statusForOutcome(
  current: SupplierOrderStatus,
  outcome: SupplierBookingOutcome,
): SupplierOrderStatus | null {
  const target: SupplierOrderStatus =
    outcome === 'confirmed'
      ? 'confirmed'
      : outcome === 'pending'
        ? 'pending_operator'
        : outcome === 'cancelled'
          ? 'cancelled'
          : 'rejected';
  if (target === current) return null;
  return canTransition(current, target) ? target : null;
}

/** Default shortest vote window a hold must leave the crew (`supplier.min_vote_window_min`). */
export const DEFAULT_MIN_VOTE_WINDOW_MIN = 60;

export const MIN_VOTE_WINDOW_CONFIG_KEY = 'supplier.min_vote_window_min';

/**
 * Whether a hold is worth taking: a hold that lapses before the crew could vote on it is not
 * taken ("book when agreed"). `validUntil` null = the supplier gave no hold at all.
 */
export function holdLeavesVoteWindow(
  validUntil: Date | null,
  now: Date,
  minVoteWindowMin: number = DEFAULT_MIN_VOTE_WINDOW_MIN,
): boolean {
  if (validUntil === null) return false;
  return validUntil.getTime() - now.getTime() >= minVoteWindowMin * 60_000;
}

/** The hold-expiry job runs this long before the supplier's own deadline. */
export const HOLD_RELEASE_LEAD_MS = 2 * 60_000;

export function holdReleaseAt(validUntil: Date, now: Date): Date {
  const at = new Date(validUntil.getTime() - HOLD_RELEASE_LEAD_MS);
  return at < now ? now : at;
}

/** A vote on a held item closes this long before the hold lapses, leaving time to pay. */
export const VOTE_CLOSE_LEAD_MS = 10 * 60_000;

export function voteDeadlineForHold(validUntil: Date): Date {
  return new Date(validUntil.getTime() - VOTE_CLOSE_LEAD_MS);
}
