/**
 * `delete_booking` (docs/api-contracts.md §4.10, offline): the owner or an organiser removes a
 * booking from the wallet. Its documents and flight segments go with it (and their status watches),
 * its reminder is cancelled and the travellers' countdowns are recomputed. The expense it was split
 * as stays unless `delete_expense` says otherwise: money already shared is not undone silently.
 */
import { emitEvent } from '@cp/db';
import { BOOKINGS_RT, deleteBookingPayloadSchema, type BookingResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { armDeadlineReminder, emitFlightChange } from '../../bookings/booking-writer';
import { syncBookedPlanItems } from '../../bookings/plan-sync';
import { deleteExpense, loadExpense } from '../../money/expense-changes';
import { defineCommand } from '../_framework/define-command';
import { requireExpenseEditor } from '../money/shared';
import { loadBooking, publishBooking, requireBookingEditor, requireVersion } from './shared';

export const deleteBookingCommand = defineCommand({
  name: 'delete_booking',
  v: 1,
  schema: deleteBookingPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
    await requireBookingEditor(tx, booking, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<BookingResult> => {
    const booking = await loadBooking(tx, payload.booking_id, ctx.uid, true);
    requireVersion(booking, payload.base_version);
    const now = ctx.clock.serverNow;
    const version = booking.version + 1;
    const expenseIds = await asSystemRole(tx, async () => {
      await tx.query('UPDATE bookings SET deleted_at = $2, version = $3 WHERE id = $1', [
        booking.id,
        now,
        version,
      ]);
      await tx.query('DELETE FROM booking_attachments WHERE booking_id = $1', [booking.id]);
      await tx.query('DELETE FROM flight_segments WHERE booking_id = $1', [booking.id]);
      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM expenses WHERE booking_id = $1 AND deleted_at IS NULL',
        [booking.id],
      );
      return rows.map((row) => row.id);
    });
    if (payload.delete_expense === true) {
      for (const expenseId of expenseIds) {
        const expense = await loadExpense(tx, expenseId, true);
        await requireExpenseEditor(
          tx,
          { trip_id: expense.tripId, created_by: expense.createdBy, payer_id: expense.payerId },
          ctx.uid,
        );
        await deleteExpense(tx, expense, ctx.uid, now);
      }
    }
    await armDeadlineReminder(tx, { id: booking.id, tz: booking.tz, freeCancelUntil: null }, now);
    await syncBookedPlanItems(tx, booking.trip_id, ctx.uid);
    await emitEvent(tx, {
      type: 'booking.deleted',
      aggregateKind: 'booking',
      aggregateId: booking.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: booking.crew_id,
      tripId: booking.trip_id,
      payload: { trip_id: booking.trip_id, booking_id: booking.id },
    });
    if (booking.type === 'flight') {
      await emitFlightChange(
        tx,
        'booking.flight_removed',
        { id: booking.id, tripId: booking.trip_id, crewId: booking.crew_id },
        booking.traveller_ids,
        ctx.uid,
      );
    }
    await publishBooking(tx, booking.crew_id, booking.visibility, BOOKINGS_RT.bookingDeleted, {
      booking_id: booking.id,
      trip_id: booking.trip_id,
    });
    return { booking_id: booking.id, version };
  },
});
