/**
 * The router's writes: the day's `ping_ledger` row (locked for the length of the routing
 * transaction, so the budget and paywall counts it read are still true when it books), the
 * `notifications` row itself, and the devices a push can reach.
 */
import type { NotificationClass, NotificationSpec } from '@cp/domain';
import type pg from 'pg';

import type { Decision } from './policy';
import type { ComposedNotification, RoutedEvent } from './register';

export interface LedgerCounts {
  readonly sentBudgeted: number;
  readonly paywallSent: number;
}

/** Creates the recipient's row for `localDate` if needed and locks it until commit. */
export async function lockLedger(
  tx: pg.PoolClient,
  uid: string,
  localDate: string,
): Promise<LedgerCounts> {
  await tx.query(
    `INSERT INTO ping_ledger (user_id, local_date) VALUES ($1, $2)
     ON CONFLICT (user_id, local_date) DO NOTHING`,
    [uid, localDate],
  );
  const { rows } = await tx.query<{ sent_budgeted: number; paywall_sent: number }>(
    `SELECT sent_budgeted, paywall_sent FROM ping_ledger
     WHERE user_id = $1 AND local_date = $2 FOR UPDATE`,
    [uid, localDate],
  );
  return { sentBudgeted: rows[0]?.sent_budgeted ?? 0, paywallSent: rows[0]?.paywall_sent ?? 0 };
}

/** Books one routed notification against the recipient's day. */
export async function bookLedger(
  tx: pg.PoolClient,
  uid: string,
  localDate: string,
  cls: NotificationClass,
  paywall: boolean,
  decision: Decision,
): Promise<void> {
  let set: string | undefined;
  if (decision.action === 'roundup') set = 'queued = queued + 1';
  else if (decision.action === 'send' && cls === 'always') set = 'sent_always = sent_always + 1';
  else if (decision.action === 'send') {
    set = `sent_budgeted = sent_budgeted + 1${paywall ? ', paywall_sent = paywall_sent + 1' : ''}`;
  }
  if (set === undefined) return;
  await tx.query(`UPDATE ping_ledger SET ${set} WHERE user_id = $1 AND local_date = $2`, [
    uid,
    localDate,
  ]);
}

/** Devices of `uid` with a live provider token whose owner has not denied notifications. */
export async function pushTargets(tx: pg.PoolClient, uid: string): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT DISTINCT d.id FROM devices d JOIN push_tokens t ON t.device_id = d.id
     WHERE d.user_id = $1 AND t.invalid_at IS NULL
       AND coalesce(d.permission_state ->> 'notif', '') <> 'denied'`,
    [uid],
  );
  return rows.map((row) => row.id);
}

const STATE_FOR: Record<Decision['action'], string> = {
  send: 'queued',
  roundup: 'rolled_into_roundup',
  drop: 'dropped',
};

export interface NotificationWrite {
  readonly uid: string;
  readonly event: RoutedEvent;
  readonly spec: NotificationSpec;
  readonly cls: NotificationClass;
  readonly composed: ComposedNotification;
  readonly title: string;
  readonly body: string;
  readonly crewId: string | null | undefined;
  readonly tripId: string | null | undefined;
  readonly dedupeKey: string;
  readonly localDate: string;
  readonly expiresAt: Date;
  readonly decision: Decision;
  readonly collapseKey: string | undefined;
}

/** Inserts the row; `undefined` when another route already wrote this dedupe key. */
export async function writeNotification(
  tx: pg.PoolClient,
  write: NotificationWrite,
): Promise<string | undefined> {
  const { composed, decision } = write;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO notifications (user_id, crew_id, trip_id, event_id, key, category, class, sender,
       template_id, title, body, ctx, deep_link, collapse_key, thread_id, dedupe_key, is_private,
       needs_you, local_date, expires_at, state, drop_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
       $20, $21, $22)
     ON CONFLICT (user_id, dedupe_key) DO NOTHING
     RETURNING id`,
    [
      write.uid,
      write.crewId ?? null,
      write.tripId ?? null,
      write.event.id,
      write.spec.key,
      write.spec.category,
      write.cls,
      JSON.stringify(composed.sender),
      composed.body.id,
      write.title,
      write.body,
      composed.ctx === undefined ? null : JSON.stringify(composed.ctx),
      composed.deepLink ?? null,
      write.collapseKey ?? null,
      composed.threadId ?? write.crewId ?? null,
      write.dedupeKey,
      write.spec.private,
      composed.needsYou ?? false,
      write.localDate,
      write.expiresAt,
      STATE_FOR[decision.action],
      decision.action === 'drop' ? decision.reason : null,
    ],
  );
  return rows[0]?.id;
}
