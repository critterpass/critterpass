/**
 * Reply-by: there are no stay holds, so the crew's deadline is
 * bounded by the earliest free-cancellation deadline of a booked stay (from the members' own
 * confirmations) and by the trip start. Viator holds are never an input: they last minutes to
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

/**
 * min(earliest free cancel − 1 d, trip start − 14 d). When that has already passed, the latest
 * moment still inside both bounds (an hour before the nearer one); null when even that is gone,
 * so the organiser picks a date or books again.
 */
export function defaultReplyBy(inputs: ReplyByInputs): Date | null {
  const freeCancel = earliestFreeCancel(inputs.freeCancelDeadlines);
  const now = inputs.now.getTime();
  const bounds = [
    ...(freeCancel === null ? [] : [freeCancel.getTime()]),
    ...(inputs.tripStart === null ? [] : [inputs.tripStart.getTime()]),
  ];
  if (bounds.length === 0) return new Date(now + OPEN_REPLY_WINDOW_MS);
  const preferred = Math.min(
    ...(freeCancel === null ? [] : [freeCancel.getTime() - FREE_CANCEL_MARGIN_MS]),
    ...(inputs.tripStart === null ? [] : [inputs.tripStart.getTime() - TRIP_START_MARGIN_MS]),
  );
  if (preferred >= now + MIN_REPLY_WINDOW_MS) return new Date(preferred);
  const fallback = Math.min(...bounds) - HOUR_MS;
  return fallback >= now + MIN_REPLY_WINDOW_MS ? new Date(fallback) : null;
}

export type ReplyByVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'in_past' }
  | { readonly ok: false; readonly reason: 'after_free_cancel'; readonly deadline: string };

export function validateReplyBy(
  replyBy: Date,
  inputs: Pick<ReplyByInputs, 'freeCancelDeadlines' | 'now'>,
): ReplyByVerdict {
  if (replyBy.getTime() < inputs.now.getTime() + MIN_REPLY_WINDOW_MS) {
    return { ok: false, reason: 'in_past' };
  }
  const freeCancel = earliestFreeCancel(inputs.freeCancelDeadlines);
  if (freeCancel !== null && replyBy.getTime() > freeCancel.getTime()) {
    return { ok: false, reason: 'after_free_cancel', deadline: freeCancel.toISOString() };
  }
  return { ok: true };
}
