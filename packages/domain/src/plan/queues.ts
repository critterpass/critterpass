/**
 * Plan job queues (docs/api-contracts-async.md §2.2): the stale sweep after every new group version
 * (keyed per version, so a burst of edits folds into one run each) and the approval vote's
 * deadline timer (fired from `scheduled_events` at the poll's `closes_at`). The worker's plan jobs
 * carry these specs themselves, so the shared queue catalogue stays as it is.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const PLAN_QUEUES = {
  staleSweep: 'plan.stale_sweep',
  changesetExpiry: 'plan.changeset_expiry',
} as const;

export const PLAN_QUEUE_SPECS = {
  'plan.stale_sweep': { policy: 'exclusive', retryLimit: 3, notify: true },
  'plan.changeset_expiry': { policy: 'exclusive', retryLimit: 5, deadLetter: true },
} as const satisfies Record<string, Partial<QueueSpec>>;

/** The plan queues' full specs over the catalogue's defaults (passed in: no import cycle). */
export function planQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof PLAN_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(PLAN_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof PLAN_QUEUE_SPECS, QueueSpec>;
}

export const PLAN_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof PLAN_QUEUE_SPECS, string>> = {
  'plan.stale_sweep':
    'Rebases pending change sets onto a new plan version, or marks the conflicting ones stale',
  'plan.changeset_expiry':
    'Closes a change set approval vote at its deadline and keeps the current plan',
};
