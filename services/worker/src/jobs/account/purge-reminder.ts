/**
 * `account.purge_reminder` (docs/api-contracts-async.md §2.3, daily): finds every closed account
 * whose purge is between two and three days away, so each is found on exactly one daily run, and
 * e-mails its owner once.
 *
 * A closed account is signed out everywhere, its push tokens are parked and the in-app inbox is
 * behind the "account closed" screen, so e-mail is the only channel. Each account ends as one of:
 * `delivered`; `no_address` (it signed in by phone only); `already` (its reminder was sent by an
 * earlier run); `not_configured` (this environment has no e-mail sender: nothing is recorded, and
 * the job does not fail); or `failed` (the provider refused: the attempt fails and is retried).
 * The reminder is recorded before it is handed to the provider and the record is taken back on a
 * refusal, so no account is ever sent two.
 */
import { withSystem } from '@cp/db';
import { ACCOUNT_QUEUES, accountPurgeReminderJobSchema } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';
import type { EmailSender } from './email-sender';
import { purgeReminderCopy } from './purge-reminder-copy';

export const PURGE_REMINDER_DAYS_BEFORE = 3;

export interface DuePurgeReminder {
  readonly deletionId: string;
  readonly userId: string;
  readonly purgeAt: Date;
}

export interface PurgeReminderReport {
  readonly due: number;
  readonly delivered: number;
  readonly no_address: number;
  readonly already: number;
  readonly not_configured: number;
  readonly failed: number;
}

export type ReminderOutcome = 'delivered' | 'no_address' | 'already';

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

/** E-mails one reminder, at most once per deletion however often it is asked for. */
export async function sendPurgeReminder(
  pool: pg.Pool,
  email: EmailSender,
  reminder: DuePurgeReminder,
): Promise<ReminderOutcome> {
  const claim = await withSystem(pool, async (tx) => {
    const contact = await tx.query<{ email: string | null; locale: string | null }>(
      'SELECT email, locale FROM app.account_purge_reminder_contact($1)',
      [reminder.deletionId],
    );
    const to = contact.rows[0]?.email ?? null;
    if (to === null) return { outcome: 'no_address' as const };
    const claimed = await tx.query(
      `INSERT INTO account_purge_reminders (deletion_id, channel) VALUES ($1, 'email')
       ON CONFLICT (deletion_id) DO NOTHING`,
      [reminder.deletionId],
    );
    if (claimed.rowCount !== 1) return { outcome: 'already' as const };
    return { outcome: 'send' as const, to, locale: contact.rows[0]?.locale ?? null };
  });
  if (claim.outcome !== 'send') return claim.outcome;
  try {
    await email.send({
      to: claim.to,
      ...purgeReminderCopy(claim.locale, reminder.purgeAt),
      idempotencyKey: `purge-reminder/${reminder.deletionId}`,
    });
  } catch (error) {
    await withSystem(pool, (tx) =>
      tx.query('DELETE FROM account_purge_reminders WHERE deletion_id = $1', [reminder.deletionId]),
    );
    throw error;
  }
  return 'delivered';
}

export async function remindDuePurges(
  pool: pg.Pool,
  logger: JobLogger,
  email: EmailSender | null,
  now: Date = new Date(),
): Promise<PurgeReminderReport> {
  const due = await withSystem(pool, (tx) => duePurgeReminders(tx, now));
  const report = {
    due: due.length,
    delivered: 0,
    no_address: 0,
    already: 0,
    not_configured: 0,
    failed: 0,
  };
  for (const reminder of due) {
    if (email === null) {
      report.not_configured += 1;
      continue;
    }
    try {
      report[await sendPurgeReminder(pool, email, reminder)] += 1;
    } catch (error) {
      report.failed += 1;
      // Ids only: the address never reaches the log.
      logger.error({ user_id: reminder.userId, err: error }, 'purge reminder failed');
    }
  }
  return report;
}

export function accountPurgeReminderJob(email: EmailSender | null = null): AnyJobDefinition {
  return defineJob({
    queue: ACCOUNT_QUEUES.purgeReminder,
    schema: accountPurgeReminderJobSchema,
    async handler(_data, { pool, logger }) {
      const report = await remindDuePurges(pool, logger, email);
      const details = { ...report };
      if (report.not_configured > 0) logger.warn(details, 'purge reminders: e-mail not configured');
      else logger.info(details, 'purge reminders finished');
      if (report.failed > 0) throw new Error(`purge reminder: ${report.failed} failed`);
      return details;
    },
  });
}
