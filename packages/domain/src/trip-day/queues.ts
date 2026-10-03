/**
 * Trip day job queues (docs/api-contracts-async.md §2.3): the morning briefing per member (a
 * `scheduled_events` timer at their local morning), the leave-by timers and recompute, and the
 * per-day offline bundle.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const TRIP_DAY_QUEUES = {
  briefing: 'briefing.build',
  leaveBySchedule: 'leaveby.schedule',
  leaveByRecompute: 'leaveby.recompute',
  dayBundle: 'daybundle.build',
} as const;

export const TRIP_DAY_QUEUE_SPECS = {
  'briefing.build': { policy: 'exclusive', retryLimit: 2, expireInSeconds: 5 * 60 },
  'leaveby.schedule': { policy: 'exclusive', retryLimit: 3, retryDelay: 5, notify: true },
  'leaveby.recompute': { policy: 'exclusive', retryLimit: 3, notify: true },
  'daybundle.build': { policy: 'exclusive', retryLimit: 3, expireInSeconds: 5 * 60 },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function tripDayQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof TRIP_DAY_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(TRIP_DAY_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof TRIP_DAY_QUEUE_SPECS, QueueSpec>;
}

export const TRIP_DAY_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof TRIP_DAY_QUEUE_SPECS, string>
> = {
  'briefing.build': "Words a member's morning briefing from the day's facts, template on failure",
  'leaveby.schedule': 'Runs a leave-by timer: window, traffic re-checks, the alarm check and T0',
  'leaveby.recompute': 'Creates and moves leave-bys after a plan or flight change',
  'daybundle.build': "Writes a trip day's offline bundle manifest; the version bumps on change",
};

/** Timer slots of one leave-by (`scheduled_events.slot`). */
export const LEAVE_BY_SLOTS = ['traffic_3h', 'traffic_45m', 'window', 'alarm', 't0'] as const;
export type LeaveBySlot = (typeof LEAVE_BY_SLOTS)[number];

export const leaveByRecomputeJobSchema = z.object({ trip_id: z.uuid() });
export type LeaveByRecomputeJob = z.infer<typeof leaveByRecomputeJobSchema>;

export const dayBundleJobSchema = z.object({ trip_id: z.uuid(), local_date: z.iso.date() });
export type DayBundleJob = z.infer<typeof dayBundleJobSchema>;

/**
 * Events after which a trip's leave-bys are recomputed: the plan, a flight or the trip moved, or a
 * booking was edited (a transfer's pickup text is placed once per text, on the next recompute).
 */
export const LEAVE_BY_INPUT_EVENTS: ReadonlySet<string> = new Set([
  'plan.version_created',
  'plan.ops_applied',
  'change_set.applied',
  'flight.status_changed',
  'trip.status_changed',
  'booking.edited',
]);
