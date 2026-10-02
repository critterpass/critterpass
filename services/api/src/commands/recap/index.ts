/**
 * The recap's api mount: the hook that queues a recap build for the events this process appends
 * (a trip an organiser ends here, or a late expense, booking, ride or payment on a trip that
 * already ended), the same hook the worker registers for its own events.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import {
  isRecapBuildEvent,
  RECAP_TRIP_STATE_SQL,
  recapBuildForEvent,
  type RecapTripState,
} from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';

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

export function registerRecap(_doors: { readonly registry: CommandRegistry }): void {
  onEventAppended(recapEventHook);
}
