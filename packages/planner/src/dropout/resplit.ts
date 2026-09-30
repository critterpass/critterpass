/**
 * Cost and booking changes of a dropout as ChangeSet ops: shared components re-split over the
 * people still going, the leaver's own entries withdrawn (lotteries are reminders, so only their
 * reminder entry goes), supplier activity seats cancelled by the supplier layer once applied, and
 * a stay booked on a third-party site turned into a "change the booking on {supplier}" item.
 */
import type { DropoutChange } from '@cp/cost-engine';
import type { ProposalOp } from '@cp/domain';

/** A supplier order the leaver holds a seat on (Viator activities). */
export interface SupplierSeat {
  readonly orderId: string;
  readonly seats: number;
}

/** A stay booked outside CritterPass that lists the leaver as a traveller. */
export interface AffiliateStay {
  readonly bookingId: string;
  readonly supplier: string;
}

export interface ResplitExtras {
  readonly leaver: string;
  /** Plan items (stable ids) the leaver is listed on. */
  readonly attendedItems: readonly string[];
  /** Components that are lottery reminder entries rather than bookable costs. */
  readonly reminderComponents: ReadonlySet<string>;
  readonly supplierSeats: readonly SupplierSeat[];
  readonly affiliateStays: readonly AffiliateStay[];
}

export function resplitOps(changes: readonly DropoutChange[], extras: ResplitExtras): ProposalOp[] {
  const ops: ProposalOp[] = [];
  for (const change of changes) {
    if (change.kind === 'split_changed') {
      ops.push({
        op: 'resplit_component',
        component_id: change.componentId,
        ways_before: change.ways.before,
        ways_after: change.ways.after,
      });
    } else if (
      change.kind === 'entry_withdrawn' &&
      extras.reminderComponents.has(change.componentId)
    ) {
      ops.push({
        op: 'withdraw_reminder_entry',
        component_id: change.componentId,
        uid: change.uid,
      });
    }
  }
  for (const stableId of extras.attendedItems) {
    ops.push({ op: 'remove_participant_from_item', stable_id: stableId, uid: extras.leaver });
  }
  for (const seat of extras.supplierSeats) {
    ops.push({
      op: 'cancel_supplier_item',
      supplier_order_id: seat.orderId,
      seats_before: seat.seats,
      seats_after: Math.max(0, seat.seats - 1),
    });
  }
  for (const stay of extras.affiliateStays) {
    ops.push({ op: 'change_stay_booking', booking_id: stay.bookingId, supplier: stay.supplier });
  }
  return ops;
}
