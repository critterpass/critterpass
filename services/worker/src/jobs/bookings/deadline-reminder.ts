/**
 * `booking.deadline_reminder` (the `scheduled_events` timer `add_booking` / `edit_booking` arm a
 * day before a free-cancellation deadline): when the booking is still live, booked and cancellable,
 * `booking.deadline_due` goes out and its owner gets the ALWAYS reminder. A booking deleted,
 * cancelled or moved past its deadline since sends nothing.
 */
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { BOOKING_PUSH, bookingLink, BOOKINGS_QUEUES, deadlineStillOpen } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { registerNotification } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

export async function remindDeadline(
  pool: pg.Pool,
  timer: Pick<ScheduledJobData, 'ref_id'>,
  now: Date,
): Promise<'reminded' | 'gone'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      trip_id: string;
      crew_id: string;
      owner_id: string;
      status: string;
      deleted: boolean;
      free_cancel_until: Date | null;
    }>(
      `SELECT b.trip_id, t.crew_id, b.owner_id, b.status, b.deleted_at IS NOT NULL AS deleted,
              b.free_cancel_until
         FROM bookings b JOIN trips t ON t.id = b.trip_id WHERE b.id = $1`,
      [timer.ref_id],
    );
    const booking = rows[0];
    if (
      booking === undefined ||
      !deadlineStillOpen({ ...booking, freeCancelUntil: booking.free_cancel_until }, now)
    ) {
      return 'gone';
    }
    await appendDomainEvent(tx, {
      type: 'booking.deadline_due',
      aggregateKind: 'booking',
      aggregateId: timer.ref_id,
      actorKind: 'system',
      actorId: null,
      crewId: booking.crew_id,
      tripId: booking.trip_id,
      payload: { trip_id: booking.trip_id, booking_id: timer.ref_id, user_id: booking.owner_id },
    });
    return 'reminded';
  });
}

export function deadlineReminderJob(): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: BOOKINGS_QUEUES.deadlineReminder,
    schema: scheduledJobDataSchema,
    singletonKey: (data) => data.ref_id,
    handler: async (data, ctx) => ({ outcome: await remindDeadline(ctx.pool, data, new Date()) }),
  });
}

/** The deadline in the booking's own zone, as the confirmation would print it. */
export function formatDeadline(at: Date, tz: string | null): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz ?? 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

export function registerDeadlinePush(): void {
  registerNotification({
    key: 'booking_deadline',
    event: 'booking.deadline_due',
    audience: (_tx, routed) => {
      const uid = str(routed, 'user_id');
      return Promise.resolve(uid === null ? [] : [uid]);
    },
    async compose(tx, routed) {
      const bookingId = str(routed, 'booking_id');
      const { rows } = await tx.query<{ title: string; tz: string | null; at: Date | null }>(
        `SELECT title, tz, free_cancel_until AS at FROM bookings
          WHERE id = $1 AND deleted_at IS NULL AND status = 'booked'`,
        [bookingId],
      );
      const row = rows[0];
      if (row?.at === null || row === undefined) return null;
      return {
        title: BOOKING_PUSH.deadlineTitle,
        body: BOOKING_PUSH.deadlineBody,
        vars: { title: row.title, deadline: formatDeadline(row.at, row.tz) },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: routed.crewId,
        tripId: routed.tripId,
        deepLink: bookingLink(bookingId ?? ''),
        collapseVars: { booking_id: bookingId ?? '' },
      };
    },
  });
}
