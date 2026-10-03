/**
 * Recap job queues (docs/api-contracts-async.md §2.3): `recap.build` runs once when a trip ends
 * (it turns `post_trip`) and again, debounced, when late data lands within the re-run window. The
 * queue is stately on the trip: one build queued and one running per trip, so a late expense during
 * a run is never lost and a burst of them folds into one run.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const RECAP_QUEUES = {
  build: 'recap.build',
  mvpClose: 'recap.mvp_close',
  narrate: 'recap.narrate',
  anniversaryScan: 'anniversary.scan',
} as const;

export const RECAP_QUEUE_SPECS = {
  'recap.build': {
    policy: 'stately',
    retryLimit: 4,
    retryDelay: 60,
    expireInSeconds: 10 * 60,
    deadLetter: true,
    notify: true,
  },
  'recap.mvp_close': { policy: 'exclusive', retryLimit: 5 },
  'anniversary.scan': {
    policy: 'singleton',
    retryLimit: 2,
    cron: { expr: '7 * * * *', tz: 'UTC' },
  },
  'recap.narrate': {
    policy: 'stately',
    retryLimit: 3,
    retryDelay: 120,
    expireInSeconds: 15 * 60,
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function recapQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof RECAP_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(RECAP_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof RECAP_QUEUE_SPECS, QueueSpec>;
}

export const RECAP_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof RECAP_QUEUE_SPECS, string>> = {
  'recap.build':
    "Builds a trip's recap from its plan, rides, money and finds; re-runs on late data",
  'recap.mvp_close':
    'Closes the MVP vote when its time is up or everyone voted, and crowns the winner',
  'recap.narrate':
    "Records the guide's voice over each story card, per crew locale, when it changed",
  'anniversary.scan': "Brings back a trip's best day a year on, in each traveller's own morning",
};

export const recapMvpCloseJobSchema = z.object({ recap_id: z.uuid() });
export type RecapMvpCloseJob = z.infer<typeof recapMvpCloseJobSchema>;

export const recapNarrateJobSchema = z.object({ recap_id: z.uuid() });
export type RecapNarrateJob = z.infer<typeof recapNarrateJobSchema>;

/** Late data re-runs the recap for this many days after the trip's last day. */
export const RECAP_RERUN_WINDOW_DAYS = 14;
/** A re-run waits this long after the first late change, so a burst becomes one run. */
export const RECAP_RERUN_DEBOUNCE_SECONDS = 10 * 60;

/** Domain events that change what a finished recap shows. */
export const RECAP_RERUN_EVENTS: ReadonlySet<string> = new Set([
  'expense.added',
  'expense.edited',
  'expense.deleted',
  'payment.confirmed',
  'trip.settled',
  'booking.added',
  'booking.edited',
  'booking.deleted',
  'ride.logged',
  'critter.befriended',
  'critter.revoked',
  'photo.added',
]);

/** Whether an appended event can (re)build a recap; the hook reads the trip only for these. */
export function isRecapBuildEvent(type: string): boolean {
  return type === 'trip.status_changed' || RECAP_RERUN_EVENTS.has(type);
}

export const RECAP_BUILD_REASONS = ['trip_ended', 'late_data', 'retry'] as const;

export const recapBuildJobSchema = z.object({
  trip_id: z.uuid(),
  reason: z.enum(RECAP_BUILD_REASONS),
  /** The last day the trip covered, as it ended (its end date, or the day it was cut short). */
  ended_on: z.iso.date().optional(),
});
export type RecapBuildJob = z.infer<typeof recapBuildJobSchema>;

/** One build queued and one running per trip. */
export function recapBuildSingletonKey(tripId: string): string {
  return `recap:${tripId}`;
}

export interface RecapBuildRequest {
  readonly queue: typeof RECAP_QUEUES.build;
  readonly data: RecapBuildJob;
  readonly options: { readonly singletonKey: string; readonly startAfter?: number };
}

/** The trip facts the event hook reads to decide whether an event (re)builds a recap. */
export interface RecapTripState {
  readonly status: string;
  /** The trip's local date now. */
  readonly today: string;
  readonly end_date: string | null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * The build an appended event asks for: the trip turning `post_trip` builds at once (the trip's
 * last covered day is the earlier of its end date and today); a late change to a trip that already
 * ended re-runs after the debounce, within the re-run window. Anything else asks for nothing.
 */
export function recapBuildForEvent(
  event: { readonly type: string; readonly tripId: string | null },
  trip: RecapTripState | null,
): RecapBuildRequest | null {
  if (event.tripId === null || trip === null) return null;
  const singletonKey = recapBuildSingletonKey(event.tripId);
  if (event.type === 'trip.status_changed') {
    if (trip.status !== 'post_trip') return null;
    const endedOn =
      trip.end_date !== null && trip.end_date < trip.today ? trip.end_date : trip.today;
    return {
      queue: RECAP_QUEUES.build,
      data: { trip_id: event.tripId, reason: 'trip_ended', ended_on: endedOn },
      options: { singletonKey },
    };
  }
  if (!RECAP_RERUN_EVENTS.has(event.type)) return null;
  if (trip.status !== 'post_trip' && trip.status !== 'archived') return null;
  if (trip.end_date !== null && daysBetween(trip.end_date, trip.today) > RECAP_RERUN_WINDOW_DAYS) {
    return null;
  }
  return {
    queue: RECAP_QUEUES.build,
    data: { trip_id: event.tripId, reason: 'late_data' },
    options: { singletonKey, startAfter: RECAP_RERUN_DEBOUNCE_SECONDS },
  };
}

/** Reads `RecapTripState` for `$1` (a trip id) on the trip's own clock. */
export const RECAP_TRIP_STATE_SQL = `
  SELECT t.status, t.end_date::text AS end_date,
         (now() AT TIME ZONE coalesce(t.tz, d.tz, 'UTC'))::date::text AS today
    FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
   WHERE t.id = $1`;
