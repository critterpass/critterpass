/**
 * The review's summary chips (3e-3): what the kept changes do to each person's share (priced by
 * `@cp/cost-engine` through the planner, so the chip and the ledger agree), how many bookings they
 * move and how many must-dos they touch. Dropped changes don't count.
 */
import type { ChangeSetOp } from '@cp/domain';
import { changeSetReview, type PlanItemState } from '@cp/planner';

import type { PlanItem } from '../../overview/model/plan-model';

export interface ReviewNumbers {
  /** Everyone's share moves by the same amount (minor units of `currency`), or null. */
  readonly eachMinor: number | null;
  readonly currency: string | null;
  readonly bookingsMoved: number;
  readonly mustDosTouched: number;
}

function itemState(item: PlanItem): PlanItemState {
  return {
    stable_id: item.stableId,
    day_no: item.dayNo,
    ...(item.startsAt === null ? {} : { starts_at: item.startsAt }),
    ...(item.endsAt === null ? {} : { ends_at: item.endsAt }),
    attendee_ids: [...item.attendeeIds],
    ...(item.bookingId === null ? {} : { booking_id: item.bookingId }),
    ...(item.mustDoId === null ? {} : { must_do_id: item.mustDoId }),
    ...(item.amountMinor === null ? {} : { amount_minor: item.amountMinor }),
    ...(item.currency === null ? {} : { currency: item.currency }),
    ...(item.costModel === 'per_person' || item.costModel === 'group' || item.costModel === 'unit'
      ? { cost_model: item.costModel }
      : {}),
  };
}

export function reviewNumbers(input: {
  readonly items: readonly PlanItem[];
  readonly ops: readonly ChangeSetOp[];
  readonly crew: readonly string[];
  /** The currency shares are shown in; without one only the counts are known. */
  readonly currency: string | null;
}): ReviewNumbers {
  const kept = input.ops.filter((op) => op.accepted !== false);
  const currency =
    input.currency ?? input.items.find((item) => item.currency !== null)?.currency ?? null;
  try {
    const review = changeSetReview({
      items: input.items.map(itemState),
      ops: kept,
      members: input.crew.map((uid) => ({ uid, origin: null })),
      currency: currency ?? 'USD',
      seenAt: new Date(0).toISOString(),
    });
    return {
      eachMinor: currency === null || review.each === null ? null : Number(review.each.amountMinor),
      currency,
      bookingsMoved: review.bookingsMoved,
      mustDosTouched: review.mustDosTouched,
    };
  } catch {
    // Prices in a currency with no rate on the phone: the counts still stand on their own.
    return { eachMinor: null, currency, bookingsMoved: 0, mustDosTouched: 0 };
  }
}
