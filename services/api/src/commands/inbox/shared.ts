/**
 * Inbox helpers the commands share: the badge counts published on `user:#uid` after any change,
 * and the `onEventAppended` hook that queues the fan-out for events the api appends (the worker
 * registers the same hook for its own events).
 */
import { outbox, sendInTx } from '@cp/db';
import {
  CHECK_INBOX_KINDS,
  ensureInboxKinds,
  HOME_INBOX_KINDS,
  IDEAS_INBOX_KINDS,
  INBOX_FANOUT_QUEUE,
  isInboxEvent,
  PLAN_CHANGE_INBOX_KINDS,
  POLL_INBOX_KINDS,
  PROPOSAL_INBOX_KINDS,
  userChannel,
  type BadgeCounts,
  type InboxFanoutJob,
} from '@cp/domain';
import type pg from 'pg';

/**
 * Every kind whose events the api appends, named here so the bundle keeps them: a kind the api
 * does not know queues no fan-out, and its inbox item is never filed.
 */
export const API_INBOX_KINDS = [
  ...HOME_INBOX_KINDS,
  ...POLL_INBOX_KINDS,
  ...CHECK_INBOX_KINDS,
  ...IDEAS_INBOX_KINDS,
  ...PROPOSAL_INBOX_KINDS,
  ...PLAN_CHANGE_INBOX_KINDS,
];
ensureInboxKinds(API_INBOX_KINDS);

export async function publishBadgeCounts(
  tx: pg.PoolClient,
  uid: string,
  now: Date,
): Promise<BadgeCounts> {
  const { rows } = await tx.query<BadgeCounts>(
    'SELECT needs_you, unread FROM app.inbox_badge_counts($1, $2)',
    [uid, now],
  );
  const counts = rows[0] ?? { needs_you: 0, unread: 0 };
  await outbox(tx, userChannel(uid), 'badge.counts', counts);
  return counts;
}

export async function enqueueInboxFanout(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!isInboxEvent(event.type)) return;
  const job: InboxFanoutJob = { event_id: event.id };
  await sendInTx(tx, INBOX_FANOUT_QUEUE, job, { singletonKey: event.id });
}
