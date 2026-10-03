/**
 * The recap's same-transaction event hook: a trip turning `post_trip` queues its first build at
 * once; a late expense, booking, ride, payment or find on a trip that already ended queues a re-run
 * ten minutes out, within the re-run window. The build queue is stately on the trip, so a burst of
 * late changes folds into one run and a change during a run is still picked up. The api registers
 * the same hook for the events its commands append.
 */
import { sendInTx } from '@cp/db';
import {
  isRecapBuildEvent,
  RECAP_TRIP_STATE_SQL,
  recapBuildForEvent,
  type RecapTripState,
} from '@cp/domain';
import type pg from 'pg';

export async function recapEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !isRecapBuildEvent(event.type)) return;
  const { rows } = await tx.query<RecapTripState>(RECAP_TRIP_STATE_SQL, [event.tripId]);
  const request = recapBuildForEvent(event, rows[0] ?? null);
  if (request === null) return;
  await sendInTx(tx, request.queue, request.data, request.options);
}
