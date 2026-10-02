/**
 * The day swap a storm decision applies (one ChangeSet on the plan): every item of the stormy day
 * moves to the calm day at the same local time and every item of the calm day moves back, so the
 * crew's days keep their shape. Instants shift by whole days (the destination has one zone for the
 * trip); items tied to a booking are flagged, since the supplier side moves separately.
 */
import type { ChangeSetOp } from '@cp/domain';

const DAY_MS = 86_400_000;

export interface SwapItem {
  readonly stableId: string;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly attendeeIds: readonly string[];
  readonly bookingId: string | null;
}

export interface SwapDay {
  readonly dayNo: number;
  readonly items: readonly SwapItem[];
}

function move(item: SwapItem, to: SwapDay, days: number, reason: string): ChangeSetOp {
  const shift = (at: Date) => new Date(at.getTime() + days * DAY_MS).toISOString();
  return {
    op: 'move',
    target: item.stableId,
    after: {
      day_no: to.dayNo,
      starts_at: shift(item.startsAt),
      ...(item.endsAt === null ? {} : { ends_at: shift(item.endsAt) }),
    },
    reason,
    affected_user_ids: [...item.attendeeIds],
    booking_impact: item.bookingId !== null,
  };
}

export function swapDayOps(
  stormy: SwapDay,
  calm: SwapDay,
  daysApart: number,
  reason: string,
): ChangeSetOp[] {
  return [
    ...stormy.items.map((item) => move(item, calm, daysApart, reason)),
    ...calm.items.map((item) => move(item, stormy, -daysApart, reason)),
  ];
}
