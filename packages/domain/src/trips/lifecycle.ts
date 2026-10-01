/**
 * The trip lifecycle's timed and signalled moves (docs/data-model-sync-and-privacy.md §3.1): the
 * ten-minute sweep of every time-driven transition, the job that reads a landing or arrival event
 * and starts (or, for a return landing, ends) the trip, and the organiser's manual start.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const TRIP_LIFECYCLE_QUEUES = {
  sweep: 'trips.lifecycle',
  signal: 'trips.lifecycle_signal',
} as const;

export const TRIP_LIFECYCLE_QUEUE_SPECS = {
  'trips.lifecycle': {
    policy: 'singleton',
    retryLimit: 2,
    expireInSeconds: 5 * 60,
    cron: { expr: '*/10 * * * *', tz: 'UTC' },
  },
  'trips.lifecycle_signal': { policy: 'exclusive', retryLimit: 5, notify: true },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function tripLifecycleQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof TRIP_LIFECYCLE_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(TRIP_LIFECYCLE_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof TRIP_LIFECYCLE_QUEUE_SPECS, QueueSpec>;
}

export const TRIP_LIFECYCLE_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof TRIP_LIFECYCLE_QUEUE_SPECS, string>
> = {
  'trips.lifecycle': 'Moves trips along their timed lifecycle in each destination time zone',
  'trips.lifecycle_signal': 'Starts a trip on its first landing or arrival; ends it on the return',
};

export const tripLifecycleSignalJobSchema = z.object({ event_id: z.uuid() });
export type TripLifecycleSignalJob = z.infer<typeof tripLifecycleSignalJobSchema>;

/** Events that can start a trip (a landing, a device arrival) or end it (a return landing). */
export const TRIP_LIFECYCLE_SIGNAL_EVENTS: ReadonlySet<string> = new Set([
  'flight.landed',
  'egg.hatched',
]);

export const startTripPayloadSchema = z.object({ trip_id: z.uuid() });
export type StartTripPayload = z.infer<typeof startTripPayloadSchema>;

export interface StartTripResult {
  readonly trip_id: string;
  readonly status: 'in_trip';
  /** False when the trip was already under way (another trigger or a replay). */
  readonly started: boolean;
}
