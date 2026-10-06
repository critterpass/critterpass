/**
 * `leave_trip` (doc delta, docs/api-contracts.md §4.7): a member who is not an organiser leaves a
 * trip that has not started. Leaving is answering OUT: it runs `decline_trip`, so the seat frees
 * for the waitlist and the dropout re-split prices the trip without them. An organiser cancels
 * the trip instead (`FORBIDDEN` `organiser_cancels`).
 */
import {
  DomainError,
  LEAVABLE_TRIP_STATUSES,
  leaveTripPayloadSchema,
  type LeaveTripPayload,
  type LeaveTripResult,
  type TripStatus,
} from '@cp/domain';

import { declineTripCommand } from '../proposal/decline-trip';
import { defineCommand } from '../_framework/define-command';
import { loadTripForRemoval } from './removal-shared';

export const leaveTripCommand = defineCommand({
  name: 'leave_trip',
  v: 1,
  schema: leaveTripPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload: LeaveTripPayload, ctx) => {
    await declineTripCommand.authorize(tx, payload, ctx);
    const trip = await loadTripForRemoval(tx, payload.trip_id);
    if (trip.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_cancels' });
  },
  handle: async (tx, payload, ctx): Promise<LeaveTripResult> => {
    const trip = await loadTripForRemoval(tx, payload.trip_id);
    if (!LEAVABLE_TRIP_STATUSES.has(trip.status as TripStatus)) {
      throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: trip.status });
    }
    await declineTripCommand.handle(tx, payload, ctx);
    return { trip_id: payload.trip_id, rsvp: 'out' };
  },
});
