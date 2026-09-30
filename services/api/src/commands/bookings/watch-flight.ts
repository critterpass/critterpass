/**
 * `watch_flight` (docs/api-contracts.md §4.10, offline; free for any wallet flight): arms (or moves)
 * a flight booking's schedule checks and boarding ping. Flights are watched when they are added; the
 * command re-arms a watch after the flight was edited offline or its timers lapsed.
 */
import { emitEvent } from '@cp/db';
import { DomainError } from '@cp/domain';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import { armFlightWatch, segmentsOf } from '../../bookings/flight-watch';
import { defineCommand } from '../_framework/define-command';
import { loadBooking } from './shared';

const watchFlightPayloadSchema = z.object({ booking_id: z.uuid() });

export const watchFlightCommand = defineCommand({
  name: 'watch_flight',
  v: 1,
  schema: watchFlightPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
    if (booking.type !== 'flight')
      throw new DomainError('STATE_INVALID', { reason: 'not_a_flight' });
  },
  handle: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
    const segments = await asSystemRole(tx, () => segmentsOf(tx, booking.id));
    const armed = await asSystemRole(tx, () => armFlightWatch(tx, segments, ctx.clock.serverNow));
    for (const segment of segments) {
      await emitEvent(tx, {
        type: 'flight.watch_started',
        aggregateKind: 'flight_segment',
        aggregateId: segment.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: booking.crew_id,
        tripId: booking.trip_id,
        payload: { trip_id: booking.trip_id, booking_id: booking.id, segment_id: segment.id },
      });
    }
    return { booking_id: booking.id, timers: armed };
  },
});
