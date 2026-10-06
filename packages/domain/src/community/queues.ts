/**
 * Community job queues (docs/api-contracts-async.md §2.2): the nightly rating counts. A plan's
 * public copy is built in the transaction that collects the last consent, a participant leaving
 * unpublishes it in the database, and tip moderation runs on the shared `compliance.check` queue.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const COMMUNITY_QUEUES = {
  aggregate: 'community.aggregate',
} as const;

export const COMMUNITY_QUEUE_SPECS = {
  'community.aggregate': {
    policy: 'exclusive',
    retryLimit: 2,
    expireInSeconds: 15 * 60,
    cron: { expr: '30 2 * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export const COMMUNITY_QUEUE_DESCRIPTIONS = {
  'community.aggregate': 'Counts place ratings and crew plan ratings every night',
} as const;

export function communityQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof COMMUNITY_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(COMMUNITY_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof COMMUNITY_QUEUE_SPECS, QueueSpec>;
}
