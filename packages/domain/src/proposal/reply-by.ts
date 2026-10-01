/**
 * Reply-by: there are no stay holds, so the crew's deadline is
 * bounded by the earliest free-cancellation deadline of a booked stay that is still live (from the
 * members' own confirmations) and by the trip start. Viator holds are never an input: they last minutes to
 * hours, so they would put the deadline in the past.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** A deadline must leave the crew at least this long to answer. */
export const MIN_REPLY_WINDOW_MS = HOUR_MS;
/** Reply this long before the earliest free cancellation ends. */
export const FREE_CANCEL_MARGIN_MS = DAY_MS;
/** Reply this long before the trip starts. */
export const TRIP_START_MARGIN_MS = 14 * DAY_MS;
/** With no booked stay and no start date, the crew gets a week. */
export const OPEN_REPLY_WINDOW_MS = 7 * DAY_MS;

export interface ReplyByInputs {
  /** `bookings.free_cancel_until` of the trip's booked stays. */
  readonly freeCancelDeadlines: readonly Date[];
  readonly tripStart: Date | null;
  readonly now: Date;
}

export function earliestFreeCancel(deadlines: readonly Date[]): Date | null {
  let earliest: Date | null = null;
  for (const deadline of deadlines) {
    if (earliest === null || deadline.getTime() < earliest.getTime()) earliest = deadline;
  }
  return earliest;
}

/** With nothing left to bound it (a last-minute trip), the crew gets a day. */
export const LAST_MINUTE_REPLY_WINDOW_MS = DAY_MS;

/**
 * The free cancellations still worth protecting: a deadline that has passed, or is too close to
 * leave the crew an hour to answer before it, bounds nothing (there is nothing left to save).
 */
export function liveFreeCancels(deadlines: readonly Date[], now: Date): Date[] {
  const least = now.getTime() + MIN_REPLY_WINDOW_MS + HOUR_MS;
  return deadlines.filter((deadline) => deadline.getTime() >= least);
}

/**
 * min(earliest free cancel − 1 d, trip start − 14 d). When that has already passed, the latest
 * moment still inside both bounds (an hour before the nearer one). A bound that can no longer be
 * met (a stay whose free cancellation passed, a trip starting within the hour or under way) is
 * left out; with no bound left the crew gets a day from now, so a last-minute trip can always be
 * proposed.
 */
export function defaultReplyBy(inputs: ReplyByInputs): Date {
  const now = inputs.now.getTime();
  const least = now + MIN_REPLY_WINDOW_MS;
  const freeCancel = earliestFreeCancel(liveFreeCancels(inputs.freeCancelDeadlines, inputs.now));
  const start =
    inputs.tripStart !== null && inputs.tripStart.getTime() - HOUR_MS >= least
      ? inputs.tripStart.getTime()
      : null;
  const bounds = [
    ...(freeCancel === null ? [] : [freeCancel.getTime()]),
    ...(start === null ? [] : [start]),
  ];
  if (bounds.length === 0) {
    const open = inputs.tripStart === null && inputs.freeCancelDeadlines.length === 0;
    return new Date(now + (open ? OPEN_REPLY_WINDOW_MS : LAST_MINUTE_REPLY_WINDOW_MS));
  }
  const preferred = Math.min(
    ...(freeCancel === null ? [] : [freeCancel.getTime() - FREE_CANCEL_MARGIN_MS]),
    ...(start === null ? [] : [start - TRIP_START_MARGIN_MS]),
  );
  if (preferred >= least) return new Date(preferred);
  return new Date(Math.min(...bounds) - HOUR_MS);
}

export type ReplyByVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'in_past' }
  | { readonly ok: false; readonly reason: 'after_free_cancel'; readonly deadline: string };

/** A picked deadline must leave an hour to answer and not pass a free cancellation still live. */
export function validateReplyBy(
  replyBy: Date,
  inputs: Pick<ReplyByInputs, 'freeCancelDeadlines' | 'now'>,
): ReplyByVerdict {
  if (replyBy.getTime() < inputs.now.getTime() + MIN_REPLY_WINDOW_MS) {
    return { ok: false, reason: 'in_past' };
  }
  const freeCancel = earliestFreeCancel(liveFreeCancels(inputs.freeCancelDeadlines, inputs.now));
  if (freeCancel !== null && replyBy.getTime() > freeCancel.getTime()) {
    return { ok: false, reason: 'after_free_cancel', deadline: freeCancel.toISOString() };
  }
  return { ok: true };
}
