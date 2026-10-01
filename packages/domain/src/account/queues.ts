/**
 * Account job queues (docs/api-contracts-async.md §2.3): the hourly purge of closed accounts whose
 * grace window has ended.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const ACCOUNT_QUEUES = {
  purge: 'account.purge',
} as const;

export const ACCOUNT_QUEUE_SPECS = {
  'account.purge': {
    policy: 'stately',
    retryLimit: 3,
    expireInSeconds: 30 * 60,
    deadLetter: true,
    cron: { expr: '5 * * * *', tz: 'UTC' },
  },
} as const satisfies Record<string, Partial<QueueSpec>>;

export function accountQueueSpecs(
  defaults: QueueSpec,
): Readonly<Record<keyof typeof ACCOUNT_QUEUE_SPECS, QueueSpec>> {
  return Object.fromEntries(
    Object.entries<Partial<QueueSpec>>(ACCOUNT_QUEUE_SPECS).map(([name, overrides]) => [
      name,
      { ...defaults, ...overrides },
    ]),
  ) as Record<keyof typeof ACCOUNT_QUEUE_SPECS, QueueSpec>;
}

export const ACCOUNT_QUEUE_DESCRIPTIONS: Readonly<
  Record<keyof typeof ACCOUNT_QUEUE_SPECS, string>
> = {
  'account.purge': 'Purges closed accounts whose grace window has ended',
};

/** The hourly run carries nothing; a run for one account names it. */
export const accountPurgeJobSchema = z.object({ user_id: z.uuid().optional() }).nullish();
export type AccountPurgeJob = z.infer<typeof accountPurgeJobSchema>;
