/**
 * Account job queues (docs/api-contracts-async.md §2.3): the hourly purge of closed accounts whose
 * grace window has ended, and "Download my data" exports (built, then retired after seven days).
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const ACCOUNT_QUEUES = {
  purge: 'account.purge',
  purgeExternal: 'account.purge_external',
  purgeReminder: 'account.purge_reminder',
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
  'account.purge_external': {
    policy: 'stately',
    retryLimit: 5,
    retryDelay: 300,
    retryBackoff: true,
    expireInSeconds: 30 * 60,
    deadLetter: true,
  },
  'account.purge_reminder': {
    policy: 'stately',
    retryLimit: 3,
    expireInSeconds: 15 * 60,
    deadLetter: true,
    cron: { expr: '15 9 * * *', tz: 'UTC' },
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
  'account.purge_external':
    'Erases one purged account from the media bucket, analytics and the AI trace store',
  'account.purge_reminder': 'Finds closed accounts three days from their purge date',
  'export.build': 'Builds one "Download my data" zip and tells its owner',
  'export.expire': 'Retires data exports past their seven days and deletes their zips',
};

/** The hourly run carries nothing; a run for one account names it. */
export const accountPurgeJobSchema = z.object({ user_id: z.uuid().optional() }).nullish();
export type AccountPurgeJob = z.infer<typeof accountPurgeJobSchema>;

/** One purged account: the deletion row proves the purge happened before anything is erased. */
export const accountPurgeExternalJobSchema = z.object({
  user_id: z.uuid(),
  deletion_id: z.uuid(),
});
export type AccountPurgeExternalJob = z.infer<typeof accountPurgeExternalJobSchema>;

/** The daily look for accounts three days from their purge carries nothing. */
export const accountPurgeReminderJobSchema = z.object({}).nullish();

/** The hourly sweep of exports past their seven days carries nothing. */
export const exportExpireJobSchema = z.object({}).nullish();
