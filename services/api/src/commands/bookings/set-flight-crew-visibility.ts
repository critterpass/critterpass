/**
 * `set_flight_crew_visibility` (doc delta, offline): the owner of a personal flight shows its
 * number and times to the crew (the default) or hides them. A crew-shared booking stays visible.
 */
import { emitEvent } from '@cp/db';
import { DomainError, setFlightCrewVisibilityPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { syncCopiedVisibility } from '../../bookings/booking-writer';
import { defineCommand } from '../_framework/define-command';
import { loadBooking } from './shared';

export const setFlightCrewVisibilityCommand = defineCommand({
  name: 'set_flight_crew_visibility',
  v: 1,
  schema: setFlightCrewVisibilityPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
    if (booking.owner_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'not_owner' });
    if (booking.type !== 'flight')
      throw new DomainError('STATE_INVALID', { reason: 'not_a_flight' });
  },
  handle: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid, true);
    const version = booking.version + 1;
    await asSystemRole(tx, () =>
      tx.query('UPDATE bookings SET flight_crew_visible = $2, version = $3 WHERE id = $1', [
        booking.id,
        payload.visible,
        version,
      ]),
    );
    await syncCopiedVisibility(tx, {
      id: booking.id,
      tripId: booking.trip_id,
      ownerId: booking.owner_id,
      visibility: booking.visibility,
      flightCrewVisible: payload.visible,
    });
    await emitEvent(tx, {
      type: 'booking.edited',
      aggregateKind: 'booking',
      aggregateId: booking.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: booking.crew_id,
      tripId: booking.trip_id,
      payload: { trip_id: booking.trip_id, booking_id: booking.id, version },
    });
    return { booking_id: booking.id, version };
  },
});
