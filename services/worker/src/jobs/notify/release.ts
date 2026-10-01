/**
 * `notify.release`: what quiet hours held goes out when they end. Every 5 minutes the scan looks
 * at each person with held notifications (`queued` with `not_before` set) and, once their quiet
 * hours are over at that moment (recomputed, so a leave-by added after the hold still ends them
 * early), releases the held items oldest first, each as its own push with its own text, actions
 * and collapse id:
 * - past its expiry → dropped (`expired`);
 * - more than 12 hours past the time it was held until (the worker was down, the scan was late) →
 *   the evening roundup, never a buzz at an odd hour;
 * - a capped kind once the day's budget is spent → the evening roundup, as budget overflow always is;
 * - no device to reach → dropped (`no_push_token`);
 * - otherwise `push.send`, booked against the day's budget.
 * One transaction per person under their ledger lock, so a release and a concurrent route agree
 * on the budget, and a doubled scan finds nothing left to release.
 */
import { withSystem } from '@cp/db';
import { getNotificationSpec } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { DEFAULT_QUEUE_SPEC, defineJob, type JobDefinition } from '../../boss';
import { loadRecipient } from './audience';
import { paywallAllowed } from './governor';
import { localClock } from './policy';
import { quietEndFor } from './quiet';
import { enqueuePushSend } from './route';
import { lockLedger, pushTargets } from './store';

export const NOTIFY_RELEASE_QUEUE = 'notify.release';
/** A held notification this far past its release time no longer goes out on its own. */
export const MAX_RELEASE_LATENESS_MS = 12 * 60 * 60 * 1000;

export interface ReleaseReport {
  readonly sent: number;
  readonly rolled: number;
  readonly dropped: number;
}

interface HeldRow {
  id: string;
  key: string;
  not_before: Date;
  expires_at: Date | null;
}

type Fate =
  | { readonly to: 'send' }
  | { readonly to: 'roundup' }
  | { readonly to: 'drop'; readonly reason: string };

async function releaseFor(tx: pg.PoolClient, uid: string, now: Date): Promise<ReleaseReport> {
  const report = { sent: 0, rolled: 0, dropped: 0 };
  const recipient = await loadRecipient(tx, uid, now);
  if (recipient === undefined) return report;
  const clock = localClock(now, recipient.tz);
  const stillQuiet = await quietEndFor(tx, uid, now, clock.minutes, recipient.prefs.quiet);
  if (stillQuiet !== null) return report;

  const ledger = await lockLedger(tx, uid, clock.date);
  const { rows } = await tx.query<HeldRow>(
    `SELECT id, key, not_before, expires_at FROM notifications
      WHERE user_id = $1 AND state = 'queued' AND not_before IS NOT NULL
      ORDER BY created_at, id FOR UPDATE`,
    [uid],
  );
  const devices = rows.length > 0 ? await pushTargets(tx, uid) : [];
  let { sentBudgeted, paywallSent } = ledger;
  let rolled = 0;
  for (const row of rows) {
    const spec = getNotificationSpec(row.key);
    const capped = spec?.capped ?? true;
    const paywall = spec?.paywall ?? false;
    let fate: Fate = { to: 'send' };
    if (row.expires_at !== null && row.expires_at.getTime() <= now.getTime()) {
      fate = { to: 'drop', reason: 'expired' };
    } else if (now.getTime() - row.not_before.getTime() > MAX_RELEASE_LATENESS_MS) {
      fate = { to: 'roundup' };
    } else if (paywall && !paywallAllowed(paywallSent)) {
      fate = { to: 'drop', reason: 'paywall_governor' };
    } else if (capped && sentBudgeted >= recipient.prefs.budgetPerDay) {
      fate = { to: 'roundup' };
    } else if (devices.length === 0) {
      fate = { to: 'drop', reason: 'no_push_token' };
    }

    if (fate.to === 'send') {
      await tx.query('UPDATE notifications SET not_before = NULL WHERE id = $1', [row.id]);
      for (const deviceId of devices) {
        await enqueuePushSend(tx, { notification_id: row.id, device_id: deviceId });
      }
      if (capped) sentBudgeted += 1;
      if (capped && paywall) paywallSent += 1;
      report.sent += 1;
    } else if (fate.to === 'roundup') {
      await tx.query(
        "UPDATE notifications SET state = 'rolled_into_roundup', not_before = NULL WHERE id = $1",
        [row.id],
      );
      rolled += 1;
      report.rolled += 1;
    } else {
      await tx.query(
        "UPDATE notifications SET state = 'dropped', drop_reason = $2, not_before = NULL WHERE id = $1",
        [row.id, fate.reason],
      );
      report.dropped += 1;
    }
  }
  await tx.query(
    `UPDATE ping_ledger SET sent_budgeted = $3, paywall_sent = $4, queued = queued + $5
      WHERE user_id = $1 AND local_date = $2`,
    [uid, clock.date, sentBudgeted, paywallSent, rolled],
  );
  return report;
}

/** Releases every person's held notifications whose quiet hours are over at `now`. */
export async function releaseHeldNotifications(pool: pg.Pool, now: Date): Promise<ReleaseReport> {
  const holders = await withSystem(pool, (tx) =>
    tx.query<{ user_id: string }>(
      `SELECT DISTINCT user_id FROM notifications
        WHERE state = 'queued' AND not_before IS NOT NULL ORDER BY user_id`,
    ),
  );
  const total = { sent: 0, rolled: 0, dropped: 0 };
  for (const { user_id: uid } of holders.rows) {
    const report = await withSystem(pool, (tx) => releaseFor(tx, uid, now));
    total.sent += report.sent;
    total.rolled += report.rolled;
    total.dropped += report.dropped;
  }
  return total;
}

export function notifyReleaseJob(now: () => Date = () => new Date()): JobDefinition<unknown> {
  return defineJob({
    queue: NOTIFY_RELEASE_QUEUE,
    spec: {
      ...DEFAULT_QUEUE_SPEC,
      policy: 'stately',
      retryLimit: 1,
      retryBackoff: false,
      expireInSeconds: 4 * 60,
      keepCompletedSeconds: 86_400,
      cron: { expr: '*/5 * * * *', tz: 'UTC' },
    },
    schema: z.unknown(),
    handler: async (_data, ctx) => ({ ...(await releaseHeldNotifications(ctx.pool, now())) }),
  });
}
