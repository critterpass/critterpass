/**
 * "Ping me" on a slow guide answer. While someone waits for a ping on the thread, the answer keeps
 * being written after their phone lets go of the stream (it is not stopped like an abandoned turn),
 * and once it is saved each waiting person gets the `guide.answer_ready` push and their ping goes.
 */
import type { TurnEvent } from '@cp/ai';
import { emitEvent } from '@cp/db';
import type pg from 'pg';

import type { GuideThread } from './threads';

/** A ping older than this was for an answer that has long landed or failed. */
export const PING_FRESH_MINUTES = 60;

/** Whether someone is waiting to be pinged when this thread's answer lands. */
export async function pingWaiting(tx: pg.PoolClient, threadId: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    `SELECT 1 FROM guide_answer_pings
      WHERE thread_id = $1 AND requested_at > now() - make_interval(mins => $2)`,
    [threadId, PING_FRESH_MINUTES],
  );
  return (rowCount ?? 0) > 0;
}

/** Inside the answer's save: one push per person waiting on the thread, then their pings go. */
export async function pushAnswerPings(
  tx: pg.PoolClient,
  thread: Pick<GuideThread, 'id' | 'tripId'>,
  messageId: string,
): Promise<number> {
  const { rows } = await tx.query<{ user_id: string; fresh: boolean }>(
    `DELETE FROM guide_answer_pings WHERE thread_id = $1
     RETURNING user_id, requested_at > now() - make_interval(mins => $2) AS fresh`,
    [thread.id, PING_FRESH_MINUTES],
  );
  let pushed = 0;
  for (const row of rows) {
    if (!row.fresh) continue;
    await emitEvent(tx, {
      type: 'guide.answer_ready',
      aggregateKind: 'guide_message',
      aggregateId: messageId,
      actorKind: 'guide',
      actorId: null,
      tripId: thread.tripId,
      payload: {
        user_id: row.user_id,
        thread_id: thread.id,
        message_id: messageId,
        trip_id: thread.tripId,
      },
    });
    pushed += 1;
  }
  return pushed;
}

/**
 * The turn's events behind a buffer the response stream reads. When the phone lets go of the
 * stream, `onLeave` decides: true keeps the turn running to its end (someone asked to be pinged),
 * false stops it as before. Either way the stream the phone held simply ends.
 */
export function detachable(
  events: AsyncGenerator<TurnEvent, void, undefined>,
  onLeave: () => Promise<boolean>,
  stop: () => void,
): { readonly stream: AsyncGenerator<TurnEvent, void, undefined>; readonly leave: () => void } {
  const buffer: TurnEvent[] = [];
  let finished = false;
  let failure: unknown = null;
  let wake: (() => void) | null = null;
  let left = false;
  const notify = () => {
    wake?.();
    wake = null;
  };
  void (async () => {
    try {
      for await (const event of events) {
        if (!left) buffer.push(event);
        notify();
      }
    } catch (error) {
      failure = error;
    } finally {
      finished = true;
      notify();
    }
  })();
  async function* stream(): AsyncGenerator<TurnEvent, void, undefined> {
    for (;;) {
      if (left) return;
      const next = buffer.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (finished) {
        if (failure !== null) throw failure;
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  }
  const leave = () => {
    if (left) return;
    left = true;
    buffer.length = 0;
    notify();
    void onLeave().then(
      (keep) => {
        if (!keep) stop();
      },
      () => stop(),
    );
  };
  return { stream: stream(), leave };
}
