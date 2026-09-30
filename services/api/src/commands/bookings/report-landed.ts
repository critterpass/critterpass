/**
 * `report_landed` (docs/api-contracts.md §4.10; the manual fallback from the card or a push): a
 * traveller on the flight says it landed. Its last leg is marked landed now (source `manual`),
 * `flight.landed` goes out once (the egg hatch and the trip's move to in-trip consume it), and the
 * crew's cards update. A flight already landed answers as it is.
 */
import { emitEvent, outbox } from '@cp/db';
import { BOOKINGS_RT, channelName, DomainError } from '@cp/domain';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { loadBooking } from './shared';

const reportLandedPayloadSchema = z.object({ booking_id: z.uuid() });

export const reportLandedCommand = defineCommand({
  name: 'report_landed',
  v: 1,
  schema: reportLandedPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
    if (booking.type !== 'flight')
      throw new DomainError('STATE_INVALID', { reason: 'not_a_flight' });
    if (booking.owner_id !== ctx.uid && !booking.traveller_ids.includes(ctx.uid)) {
      throw new DomainError('FORBIDDEN', { reason: 'not_a_traveller' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid, true);
    const now = ctx.clock.serverNow;
    const landed = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string; crew_visible: boolean; status: string }>(
        `SELECT id, crew_visible, status FROM flight_segments WHERE booking_id = $1
          ORDER BY segment_no DESC LIMIT 1 FOR UPDATE`,
        [booking.id],
      );
      const last = rows[0];
      if (last === undefined) throw new DomainError('STATE_INVALID', { reason: 'no_segments' });
      if (last.status === 'landed') return null;
      await tx.query(
        `UPDATE flight_segments SET status = 'landed', act_arr_at = coalesce(act_arr_at, $2),
           status_source = 'manual', status_at = $2, version = version + 1 WHERE id = $1`,
        [last.id, now],
      );
      await tx.query(
        `UPDATE flight_watches SET active_until = least(active_until, $2::timestamptz + interval '1 day')
          WHERE flight_segment_id = $1 AND ended_at IS NULL`,
        [last.id, now],
      );
      return last;
    });
    if (landed === null) return { booking_id: booking.id, status: 'landed' as const };
    const ids = { trip_id: booking.trip_id, booking_id: booking.id, segment_id: landed.id };
    const base = {
      aggregateKind: 'flight_segment',
      aggregateId: landed.id,
      actorKind: 'user' as const,
      actorId: ctx.uid,
      crewId: booking.crew_id,
      tripId: booking.trip_id,
    };
    await emitEvent(tx, {
      ...base,
      type: 'flight.status_changed',
      payload: { ...ids, change: 'landed', status: 'landed' },
    });
    await emitEvent(tx, {
      ...base,
      type: 'flight.landed',
      payload: {
        ...ids,
        user_ids: [...new Set([booking.owner_id, ...booking.traveller_ids])],
        source: 'manual',
      },
    });
    await outbox(
      tx,
      landed.crew_visible
        ? channelName('crew_bookings', booking.crew_id)
        : channelName('user', booking.owner_id),
      BOOKINGS_RT.flightStatus,
      { segment_id: landed.id, booking_id: booking.id, status: 'landed' },
    );
    return { booking_id: booking.id, status: 'landed' as const };
  },
});
