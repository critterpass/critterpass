/**
 * Free-cancellation deadlines from the traveller’s own confirmation (real deadlines only, never
 * invented ones: we are never the merchant of record). The owner is reminded a day before the deadline, or
 * at once when a booking lands with less than a day left; a deadline that has passed is quiet.
 */
export const DEADLINE_REMINDER_LEAD_HOURS = 24;

const HOUR_MS = 3_600_000;

/** When the reminder fires, or `null` when the deadline has already passed. */
export function deadlineReminderAt(freeCancelUntil: Date, now: Date): Date | null {
  if (freeCancelUntil.getTime() <= now.getTime()) return null;
  const at = new Date(freeCancelUntil.getTime() - DEADLINE_REMINDER_LEAD_HOURS * HOUR_MS);
  return at.getTime() > now.getTime() ? at : now;
}

/** Whether a reminder due now still makes sense: the booking is live and still cancellable. */
export function deadlineStillOpen(
  booking: {
    readonly status: string;
    readonly deleted: boolean;
    readonly freeCancelUntil: Date | null;
  },
  now: Date,
): boolean {
  return (
    !booking.deleted &&
    booking.status === 'booked' &&
    booking.freeCancelUntil !== null &&
    booking.freeCancelUntil.getTime() > now.getTime()
  );
}
