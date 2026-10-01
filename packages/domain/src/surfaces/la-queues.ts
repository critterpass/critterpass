/**
 * Live Activity job queues (docs/api-contracts-async.md §2.2, §2.3): the orchestrator (one run per
 * object, folding bursts of events into one push), the minute lifecycle sweep (starts that are due,
 * time-driven transitions, stale and ended activities, the 8-hour restart) and the hourly broadcast
 * channel clean-up.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';
import { laKindSchema } from './la-common';

export const LA_QUEUES = {
  orchestrate: 'la.orchestrate',
  lifecycle: 'la.lifecycle',
  channels: 'la.channels',
} as const;

export const LA_QUEUE_SPECS = {
  'la.orchestrate': {
    policy: 'exclusive',
    retryLimit: 3,
    retryDelay: 5,
    expireInSeconds: 60,
    keepCompletedSeconds: 3600,
    notify: true,
  },
  'la.lifecycle': {
    policy: 'stately',
    retryLimit: 1,
    expireInSeconds: 55,
    keepCompletedSeconds: 3600,
    cron: { expr: '* * * * *', tz: 'UTC' },
  },
  'la.channels': {
    policy: 'stately',
    retryLimit: 2,
    keepCompletedSeconds: 86_400,
    cron: { expr: '17 * * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function laQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof LA_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(LA_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof LA_QUEUE_SPECS, QueueSpec>;
}

export const LA_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof LA_QUEUE_SPECS, string>> = {
  'la.orchestrate': "Starts, updates or ends an object's Live Activities on every device",
  'la.lifecycle': 'Starts due Live Activities, moves timed ones on, restarts and ends old ones',
  'la.channels': 'Deletes APNs broadcast channels of finished objects',
};

export const laOrchestrateJobSchema = z.object({ kind: laKindSchema, ref_id: z.uuid() });
export type LaOrchestrateJob = z.infer<typeof laOrchestrateJobSchema>;

export function laOrchestrateSingletonKey(job: LaOrchestrateJob): string {
  return `${job.kind}:${job.ref_id}`;
}
