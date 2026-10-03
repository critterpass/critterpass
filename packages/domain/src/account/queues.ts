/**
 * Account job queues (docs/api-contracts-async.md §2.3): the hourly purge of closed accounts whose
 * grace window has ended, and "Download my data" exports (built, then retired after seven days).
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const ACCOUNT_QUEUES = {
  purge: 'account.purge',
  exportBuild: 'export.build',
  exportExpire: 'export.expire',
} as const;

export const ACCOUNT_QUEUE_SPECS = {
  'account.purge': {
    policy: 'stately',
    retryLimit: 3,
    expireInSeconds: 30 * 60,
    deadLetter: true,
    cron: { expr: '5 * * * *', tz: 'UTC' },
  },
  'export.build': {
    policy: 'stately',
    retryLimit: 2,
    expireInSeconds: 15 * 60,
    deadLetter: true,
  },
  'export.expire': {
    policy: 'stately',
    retryLimit: 3,
    expireInSeconds: 15 * 60,
    deadLetter: true,
    cron: { expr: '20 * * * *', tz: 'UTC' },
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
  'export.build': 'Builds one "Download my data" zip and tells its owner',
  'export.expire': 'Retires data exports past their seven days and deletes their zips',
};

/** The hourly run carries nothing; a run for one account names it. */
export const accountPurgeJobSchema = z.object({ user_id: z.uuid().optional() }).nullish();
export type AccountPurgeJob = z.infer<typeof accountPurgeJobSchema>;

/** The hourly sweep of exports past their seven days carries nothing. */
export const exportExpireJobSchema = z.object({}).nullish();
