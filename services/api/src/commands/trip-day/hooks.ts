/** Queues a leave-by recompute for every event the api appends that can move one. */
import { sendInTx } from '@cp/db';
import { LEAVE_BY_INPUT_EVENTS, TRIP_DAY_QUEUES } from '@cp/domain';
import type pg from 'pg';

export async function enqueueLeaveByRecompute(
  tx: pg.PoolClient,
  event: { readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !LEAVE_BY_INPUT_EVENTS.has(event.type)) return;
  await sendInTx(
    tx,
    TRIP_DAY_QUEUES.leaveByRecompute,
    { trip_id: event.tripId },
    { singletonKey: event.tripId },
  );
}
