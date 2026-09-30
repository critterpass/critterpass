/**
 * Account job queues (docs/api-contracts-async.md §2.2, §2.3): the export build, the hourly purge
 * of due deletions, one retried job per external store a purge must reach, and the N-52 reminder.
 */
import { z } from 'zod';

import type { QueueSpec } from '../jobs/catalogue';

export const ACCOUNT_QUEUES = {
  exportBuild: 'export.build',
  exportExpire: 'export.expire',
  purge: 'account.purge',
  purgeExternal: 'account.purge_external',
  purgeReminder: 'account.purge_reminder',
  mail: 'account.mail',
} as const;

export const ACCOUNT_QUEUE_SPECS = {
  'export.build': {
    policy: 'exclusive',
    retryLimit: 3,
    retryDelay: 60,
    expireInSeconds: 30 * 60,
    deadLetter: true,
    notify: true,
  },
  'export.expire': {
    policy: 'stately',
    retryLimit: 2,
    cron: { expr: '15 * * * *', tz: 'UTC' },
  },
  'account.purge': {
    policy: 'stately',
    retryLimit: 3,
    expireInSeconds: 30 * 60,
    deadLetter: true,
    cron: { expr: '5 * * * *', tz: 'UTC' },
  },
  'account.purge_external': {
    policy: 'exclusive',
    retryLimit: 10,
    retryDelay: 300,
    retryBackoff: true,
    deadLetter: true,
  },
  'account.purge_reminder': {
    policy: 'stately',
    retryLimit: 2,
    cron: { expr: '35 * * * *', tz: 'UTC' },
  },
  'account.mail': { policy: 'exclusive', retryLimit: 5, retryBackoff: true, deadLetter: true },
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
  'export.build': "Zips one user's data export and sends the link",
  'export.expire': 'Expires data export links past seven days and deletes their zips',
  'account.purge': 'Purges closed accounts whose grace window has ended',
  'account.purge_external': 'Erases a purged account from one external store',
  'account.purge_reminder': 'Reminds closed accounts three days before their purge',
  'account.mail': 'Sends one account e-mail: export ready, deletion confirmed, purge reminder',
};

export const ACCOUNT_MAIL_KINDS = ['export_ready', 'deletion_confirmed', 'purge_reminder'] as const;
export type AccountMailKind = (typeof ACCOUNT_MAIL_KINDS)[number];

/** One e-mail to one account; the address is looked up when the job runs, never carried here. */
export const accountMailJobSchema = z.object({
  kind: z.enum(ACCOUNT_MAIL_KINDS),
  user_id: z.uuid(),
  /** The export or deletion the mail is about. */
  ref_id: z.uuid(),
});
export type AccountMailJob = z.infer<typeof accountMailJobSchema>;

export const exportBuildJobSchema = z.object({ export_id: z.uuid() });
export type ExportBuildJob = z.infer<typeof exportBuildJobSchema>;

/** External stores a purge reaches, one job each, retried until they answer. */
export const PURGE_EXTERNAL_STEPS = ['r2_exports', 'r2_media', 'posthog', 'langfuse'] as const;
export type PurgeExternalStep = (typeof PURGE_EXTERNAL_STEPS)[number];

export const purgeExternalJobSchema = z.object({
  deletion_id: z.uuid(),
  user_id: z.uuid(),
  step: z.string().min(1),
  /** R2 keys of the user's media, captured before their rows were deleted. */
  media_keys: z.array(z.string()).default([]),
});
export type PurgeExternalJob = z.infer<typeof purgeExternalJobSchema>;

/** Manual purge of one account (legal request), queued by the console. */
export const accountPurgeJobSchema = z
  .object({ user_id: z.uuid().optional(), forced: z.boolean().optional() })
  .nullish();
export type AccountPurgeJob = z.infer<typeof accountPurgeJobSchema>;
