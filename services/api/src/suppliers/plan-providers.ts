/**
 * The supplier layer's answers to the plan's change-set seams (packages/domain/src/plan):
 *
 * - Hold expiry: a vote on a plan item with an open supplier hold closes ten minutes before the
 *   earliest hold lapses, so the crew never votes a held seat into expiry and there is still time
 *   to pay. Only holds kept for a vote count (a hold too short to vote on was never kept).
 * - Booking impact: an item booked through a supplier order cannot be moved or re-timed by a plan
 *   change (Viator bookings are not rescheduled through us: the supplier refuses, the change is
 *   blocked); removing it is a cancellation the organiser confirms, with its refund quote first.
 */
import {
  OPEN_HOLD_STATUSES,
  registerBookingImpactProvider,
  registerHoldExpiryProvider,
  voteDeadlineForHold,
  type BookingImpact,
  type BookingImpactProvider,
  type HoldExpiryProvider,
} from '@cp/domain';

export const supplierHoldExpiry: HoldExpiryProvider = {
  async earliestHoldExpiry({ tripId, stableIds, query }) {
    if (stableIds.length === 0) return null;
    const rows = await query<{ until: Date | null }>(
      `SELECT min(hold_valid_until) AS until FROM supplier_orders
        WHERE trip_id = $1 AND stable_id = ANY ($2::uuid[])
          AND status = ANY ($3::text[]) AND hold_valid_until IS NOT NULL`,
      [tripId, stableIds, OPEN_HOLD_STATUSES],
    );
    const until = rows[0]?.until ?? null;
    return until === null ? null : voteDeadlineForHold(new Date(until));
  },
};

export const supplierBookingImpact: BookingImpactProvider = {
  async impactOf({ ops, bookedItems, query }) {
    const bookingIds = [...new Set(bookedItems.values())];
    if (bookingIds.length === 0) return [];
    const rows = await query<{ id: string }>(
      `SELECT b.id FROM bookings b JOIN supplier_orders o ON o.id = b.supplier_order_id
        WHERE b.id = ANY ($1::uuid[]) AND o.status IN ('confirmed', 'pending_operator')`,
      [bookingIds],
    );
    const supplierBooked = new Set(rows.map((row) => row.id));
    return ops.flatMap((op): BookingImpact[] => {
      const bookingId = bookedItems.get(op.target);
      if (bookingId === undefined || !supplierBooked.has(bookingId) || op.op === 'add') return [];
      if (op.op === 'remove') {
        return [
          {
            stableId: op.target,
            bookingId,
            kind: 'cancel',
            blocked: false,
            reason: 'suppliers.impact.cancel_with_quote',
          },
        ];
      }
      return [
        {
          stableId: op.target,
          bookingId,
          kind: 'reschedule',
          blocked: true,
          reason: 'suppliers.impact.reschedule_refused',
        },
      ];
    });
  },
};

export function registerSupplierPlanProviders(): void {
  registerHoldExpiryProvider(supplierHoldExpiry);
  registerBookingImpactProvider(supplierBookingImpact);
}
