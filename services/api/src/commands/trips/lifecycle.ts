/**
 * The trip lifecycle's api mount: the organiser's `start_trip`, `cancel_trip` and `delete_trip`, a
 * member's `leave_trip`, and the hook that queues a lifecycle signal for the landings and arrivals
 * the api appends (`report_landed`, `hatch_egg` arrived); the worker hooks the ones it appends
 * itself and runs the timed sweep.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import { TRIP_LIFECYCLE_QUEUES, TRIP_LIFECYCLE_SIGNAL_EVENTS } from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';
import { cancelTripCommand } from './cancel-trip';
import { deleteTripCommand } from './delete-trip';
import { leaveTripCommand } from './leave-trip';
import { startTripCommand } from './start-trip';

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

export function registerTripLifecycleCommands(registry: CommandRegistry): void {
  registry.register(startTripCommand);
  registry.register(cancelTripCommand);
  registry.register(deleteTripCommand);
  registry.register(leaveTripCommand);
}

export function registerTripLifecycle(doors: { readonly registry: CommandRegistry }): void {
  registerTripLifecycleCommands(doors.registry);
  onEventAppended(tripLifecycleEventHook);
}
