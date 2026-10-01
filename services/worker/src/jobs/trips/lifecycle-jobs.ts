/**
 * The trip lifecycle jobs, and (once per process) the hook that queues a lifecycle signal for the
 * landings and arrivals this process appends (the api hooks the ones it appends itself).
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { TRIP_LIFECYCLE_QUEUES, TRIP_LIFECYCLE_SIGNAL_EVENTS } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss';
import { tripLifecycleJob } from './lifecycle';
import { tripLifecycleSignalJob } from './lifecycle-signal';

export async function tripLifecycleEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !TRIP_LIFECYCLE_SIGNAL_EVENTS.has(event.type)) return;
  await sendInTx(
    tx,
    TRIP_LIFECYCLE_QUEUES.signal,
    { event_id: event.id },
    { singletonKey: event.id },
  );
}

let hooked = false;

export function tripLifecycleJobs(): AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(tripLifecycleEventHook);
  }
  return [tripLifecycleJob(), tripLifecycleSignalJob()];
}
