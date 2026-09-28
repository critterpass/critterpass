/**
 * Inbox helpers the commands share: the badge counts published on `user:#uid` after any change,
 * and the `onEventAppended` hook that queues the fan-out for events the api appends (the worker
 * registers the same hook for its own events).
 */
import { outbox, sendInTx } from '@cp/db';
import {
  INBOX_FANOUT_QUEUE,
  isInboxEvent,
  userChannel,
  type BadgeCounts,
  type InboxFanoutJob,
} from '@cp/domain';
import type pg from 'pg';

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
