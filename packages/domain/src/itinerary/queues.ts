/**
 * Drafting job queues (docs/api-contracts-async.md §2.2): the draft retries twice and then waits
 * in its dead-letter queue; a redraft retries twice and releases its reservation when it finally
 * fails. Both are keyed by their agent job, so a start never runs twice at once.
 */
import type { QueueSpec } from '../jobs/catalogue';

export const DRAFT_QUEUE_SPECS = {
  'ai.draft': {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 5,
    expireInSeconds: 10 * 60,
    deadLetter: true,
    notify: true,
  },
  'ai.redraft': {
    policy: 'exclusive',
    retryLimit: 2,
    retryDelay: 5,
    expireInSeconds: 5 * 60,
    deadLetter: true,
    notify: true,
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

/** The drafting queues' full specs over the catalogue's defaults (passed in: no import cycle). */
export function draftQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof DRAFT_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(DRAFT_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof DRAFT_QUEUE_SPECS, QueueSpec>;
}

export const DRAFT_QUEUE_DESCRIPTIONS: Readonly<Record<keyof typeof DRAFT_QUEUE_SPECS, string>> = {
  'ai.draft': 'Drafts a trip for its organiser: outline, days, checks and the private version',
  'ai.redraft': 'Redrafts one day of an organiser draft and diffs it against the day it replaces',
};
