/**
 * `account.purge_reminder` (docs/api-contracts-async.md §2.3, daily): finds every closed account
 * whose purge is between two and three days away, so each is found on exactly one daily run, and
 * hands it to the reminder sender.
 *
 * A closed account is signed out everywhere, its push tokens are parked and the in-app inbox is
 * behind the "account closed" screen, so the only channel that can reach its owner is one outside
 * the app. The worker has no such sender; until one is passed in, every reminder is counted as
 * `undelivered` in the job's result (ids only), which is the record ops reads in the console's
 * jobs view. The app's own restore screen shows the purge date whenever the owner comes back.
 */
import { withSystem } from '@cp/db';
import { ACCOUNT_QUEUES, accountPurgeReminderJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';

export const PURGE_REMINDER_DAYS_BEFORE = 3;

export interface DuePurgeReminder {
  readonly deletionId: string;
  readonly userId: string;
  readonly purgeAt: Date;
}

/** Reaches a closed account's owner outside the app; `false` when it has no way to. */
export type PurgeReminderSender = (reminder: DuePurgeReminder) => Promise<boolean>;

export interface PurgeReminderReport {
  readonly due: number;
  readonly delivered: number;
  readonly undelivered: number;
  readonly failed: number;
}

/** Closed, unrestored, unpurged accounts whose purge is two to three days from `now`. */
export async function duePurgeReminders(tx: pg.PoolClient, now: Date): Promise<DuePurgeReminder[]> {
  const { rows } = await tx.query<{ id: string; user_id: string; purge_at: Date }>(
    `SELECT id, user_id, purge_at FROM account_deletions
      WHERE restored_at IS NULL AND purged_at IS NULL
        AND purge_at > $1::timestamptz + make_interval(days => $2 - 1)
        AND purge_at <= $1::timestamptz + make_interval(days => $2)
      ORDER BY purge_at`,
    [now, PURGE_REMINDER_DAYS_BEFORE],
  );
  return rows.map((row) => ({ deletionId: row.id, userId: row.user_id, purgeAt: row.purge_at }));
}

export async function remindDuePurges(
  pool: pg.Pool,
  logger: JobLogger,
  send: PurgeReminderSender | null,
  now: Date = new Date(),
): Promise<PurgeReminderReport> {
  const due = await withSystem(pool, (tx) => duePurgeReminders(tx, now));
  const report = { due: due.length, delivered: 0, undelivered: 0, failed: 0 };
  for (const reminder of due) {
    try {
      if (send !== null && (await send(reminder))) report.delivered += 1;
      else report.undelivered += 1;
    } catch (error) {
      report.failed += 1;
      logger.error({ user_id: reminder.userId, err: error }, 'purge reminder failed');
    }
  }
  return report;
}

export function accountPurgeReminderJob(send: PurgeReminderSender | null = null): AnyJobDefinition {
  return defineJob({
    queue: ACCOUNT_QUEUES.purgeReminder,
    schema: accountPurgeReminderJobSchema,
    async handler(_data, { pool, logger }) {
      const report = await remindDuePurges(pool, logger, send);
      const details = { ...report };
      if (report.undelivered > 0) logger.warn(details, 'purge reminders with no channel');
      else logger.info(details, 'purge reminders finished');
      if (report.failed > 0) throw new Error(`purge reminder: ${report.failed} failed`);
      return details;
    },
  });
}
