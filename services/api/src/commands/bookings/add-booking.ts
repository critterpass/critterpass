/**
 * `add_booking` (docs/api-contracts.md §4.10, offline): a trip participant adds a typed booking to
 * the wallet by hand. Travellers and the payer must take part in the trip; a flight brings its legs;
 * the visibility defaults to the crew's for shared stays and activities and to the owner's for
 * flights. With `split`, the price becomes a crew expense in the same transaction.
 */
import { addBookingPayloadSchema, defaultBookingVisibility, type BookingResult } from '@cp/domain';

import { splitBookingExpense } from '../../bookings/booking-expense';
import { insertBooking } from '../../bookings/booking-writer';
import { syncBookedPlanItems } from '../../bookings/plan-sync';
import { defineCommand } from '../_framework/define-command';
import { sealBarcode, type BookingCommandDeps } from './deps';
import { requireInTrip, requireTripParticipant } from './shared';

export function createAddBookingCommand(deps: BookingCommandDeps) {
  return defineCommand({
    name: 'add_booking',
    v: 1,
    schema: addBookingPayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    },
    handle: async (tx, payload, ctx): Promise<BookingResult> => {
      const trip = await requireTripParticipant(tx, payload.trip_id, ctx.uid);
      const travellerIds = payload.traveller_ids ?? [ctx.uid];
      await requireInTrip(tx, trip.id, [
        ...travellerIds,
        ...(payload.paid_by === undefined ? [] : [payload.paid_by]),
      ]);
      const now = ctx.clock.serverNow;
      const booking = {
        id: payload.booking_id,
        tripId: trip.id,
        crewId: trip.crew_id,
        ownerId: ctx.uid,
        kind: payload.kind,
        title: payload.title,
        startsAt: payload.starts_at === undefined ? null : new Date(payload.starts_at),
        endsAt: payload.ends_at === undefined ? null : new Date(payload.ends_at),
        tz: payload.tz ?? trip.tz,
        location: payload.location ?? null,
        travellerIds,
        priceMinor: payload.price === undefined ? null : BigInt(payload.price.amount_minor),
        currency: payload.price?.currency ?? null,
        paidBy: payload.paid_by ?? null,
        source: 'manual' as const,
        supplier: payload.supplier ?? (payload.kind === 'flight' ? 'airline' : 'other'),
        supplierRef: payload.supplier_ref ?? null,
        freeCancelUntil:
          payload.free_cancel_until === undefined ? null : new Date(payload.free_cancel_until),
        cancelPolicyText: payload.cancel_policy_text ?? null,
        visibility:
          payload.visibility ?? defaultBookingVisibility(payload.kind, travellerIds.length),
        flightCrewVisible: true,
        details: payload.details ?? {},
        barcode: sealBarcode(deps, payload.barcode),
        segments: payload.segments ?? [],
        attachments: payload.attachments ?? [],
      };
      await insertBooking(tx, booking, ctx.uid, now);
      await syncBookedPlanItems(tx, trip.id, ctx.uid);
      if (payload.split === undefined || booking.priceMinor === null || booking.currency === null) {
        return { booking_id: booking.id, version: 1 };
      }
      const expense = await splitBookingExpense(
        tx,
        trip,
        { ...booking, priceMinor: booking.priceMinor, currency: booking.currency },
        payload.split,
        ctx.uid,
        now,
      );
      return { booking_id: booking.id, version: 1, expense_id: expense.expense_id };
    },
  });
}
