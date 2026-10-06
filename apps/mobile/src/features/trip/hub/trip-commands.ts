/**
 * Ending a trip from its menu: deleting a lone setup trip, calling one off, or leaving it. Each
 * needs the server's answer (the confirm sheet says what happens), so none waits in the queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { CancelTripPayload, DeleteTripPayload, LeaveTripPayload } from '@cp/domain';

import { defineClientCommand } from '@/data/commands/summaries';

export const DELETE_TRIP = defineClientCommand<DeleteTripPayload>({
  name: 'delete_trip',
  offline: false,
});

export const CANCEL_TRIP = defineClientCommand<CancelTripPayload>({
  name: 'cancel_trip',
  offline: false,
});

export const LEAVE_TRIP = defineClientCommand<LeaveTripPayload>({
  name: 'leave_trip',
  offline: false,
});
