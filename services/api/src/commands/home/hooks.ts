/** Queues a countdown recompute for every event the api appends that can move a countdown. */
import { sendInTx } from '@cp/db';
import { COUNTDOWN_INPUT_EVENTS, COUNTDOWN_RECOMPUTE_QUEUE } from '@cp/domain';
import type pg from 'pg';

export async function enqueueCountdownRecompute(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!COUNTDOWN_INPUT_EVENTS.has(event.type)) return;
  await sendInTx(tx, COUNTDOWN_RECOMPUTE_QUEUE, { event_id: event.id }, { singletonKey: event.id });
}
