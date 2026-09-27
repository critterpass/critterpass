/**
 * Per-object timers (`scheduled_events`, docs/api-contracts-async.md §2.3): a command arms a timer
 * in the object's local time inside its own transaction, and the minute cron `sched.enqueue_due`
 * turns it into a job on the `kind` queue once due. Arming the same `(kind, refId, slot)` again
 * re-arms it (the reschedule path); cancelling only affects a timer that has not fired yet.
 */
import { localSchedule, toLocalWallTime } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

interface TimerKey {
  /** Target queue, `<domain>.<action>`. */
  readonly kind: string;
  readonly refId: string;
  /** Tells apart several timers of one kind on one object; defaults to `''`. */
  readonly slot?: string;
}

export type ScheduleEventInput = TimerKey & {
  /** IANA zone the timer belongs to (the trip's, the user's device zone, ...). */
  readonly tz: string;
  /** Extra job payload, kept small: handlers re-read the object by `refId`. */
  readonly data?: Record<string, unknown>;
} & (
    | { readonly local: { readonly date: string; readonly time: string }; readonly at?: never }
    | { readonly at: Date; readonly local?: never }
  );

/** The payload every job fired from `scheduled_events` receives. */
export const scheduledJobDataSchema = z.object({
  scheduled_event_id: z.uuid(),
  ref_id: z.uuid(),
  slot: z.string(),
  due_at: z.iso.datetime({ offset: true }),
  data: z.record(z.string(), z.unknown()),
});

export type ScheduledJobData = z.infer<typeof scheduledJobDataSchema>;

function wallTimeOf(input: ScheduleEventInput): { local: string; dueAt: Date } {
  if (input.at !== undefined) {
    const wall = toLocalWallTime(input.at, input.tz);
    return { local: `${wall.date}T${wall.time}`, dueAt: input.at };
  }
  const dueAt = localSchedule({ ...input.local, tz: input.tz });
  return { local: `${input.local.date}T${input.local.time}`, dueAt };
}

/** Arms (or re-arms) a timer; resolves to its `scheduled_events.id`. */
export async function scheduleEvent(tx: pg.PoolClient, input: ScheduleEventInput): Promise<string> {
  const { local, dueAt } = wallTimeOf(input);
  const { rows } = await tx.query<{ id: string }>(
    'SELECT app.schedule_event($1, $2, $3, $4, $5, $6, $7) AS id',
    [
      input.kind,
      input.refId,
      input.slot ?? '',
      local,
      input.tz,
      dueAt.toISOString(),
      JSON.stringify(input.data ?? {}),
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new Error('app.schedule_event returned no row');
  return row.id;
}

/** Moves a timer to a new local time or zone; the same as arming it again. */
export const rescheduleEvent = scheduleEvent;

/** Cancels a pending timer; resolves to whether one was pending. */
export async function cancelScheduledEvent(tx: pg.PoolClient, key: TimerKey): Promise<boolean> {
  const { rows } = await tx.query<{ cancelled: boolean }>(
    'SELECT app.cancel_scheduled_event($1, $2, $3) AS cancelled',
    [key.kind, key.refId, key.slot ?? ''],
  );
  return rows[0]?.cancelled === true;
}
