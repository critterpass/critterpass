/**
 * `set_booking_visibility` (doc delta, offline): the owner shares a booking with the trip's crew or
 * takes it back. Its documents follow; its flight segments stay visible while the owner leaves the
 * flight visible to the crew (`set_flight_crew_visibility`).
 */
import { emitEvent } from '@cp/db';
import { BOOKINGS_RT, DomainError, setBookingVisibilityPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { syncCopiedVisibility } from '../../bookings/booking-writer';
import { defineCommand } from '../_framework/define-command';
import { loadBooking, publishBooking } from './shared';

export const setBookingVisibilityCommand = defineCommand({
  name: 'set_booking_visibility',
  v: 1,
  schema: setBookingVisibilityPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
    if (booking.owner_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'not_owner' });
  },
  handle: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid, true);
    if (booking.visibility === payload.visibility) {
      return { booking_id: booking.id, version: booking.version };
    }
    const version = booking.version + 1;
    await asSystemRole(tx, () =>
      tx.query('UPDATE bookings SET visibility = $2, version = $3 WHERE id = $1', [
        booking.id,
        payload.visibility,
        version,
      ]),
    );
    await syncCopiedVisibility(tx, {
      id: booking.id,
      tripId: booking.trip_id,
      ownerId: booking.owner_id,
      visibility: payload.visibility,
      flightCrewVisible: booking.flight_crew_visible,
    });
    await emitEvent(tx, {
      type: 'booking.visibility_changed',
      aggregateKind: 'booking',
      aggregateId: booking.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: booking.crew_id,
      tripId: booking.trip_id,
      payload: { trip_id: booking.trip_id, booking_id: booking.id, visibility: payload.visibility },
    });
    // Shared now: the crew hears of it. Taken back: the crew's rows leave with the next sync.
    await publishBooking(tx, booking.crew_id, 'crew', BOOKINGS_RT.bookingEdited, {
      booking_id: booking.id,
      trip_id: booking.trip_id,
      version,
    });
    return { booking_id: booking.id, version };
  },
});
