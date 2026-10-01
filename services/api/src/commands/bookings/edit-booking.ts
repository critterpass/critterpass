/**
 * `edit_booking` (docs/api-contracts.md §4.10, offline): the owner or an organiser corrects a
 * booking against the version they saw. Fields in `patch` replace the stored ones, `clear` empties
 * optional ones; new legs replace a flight's segments (their status restarts from the schedule),
 * documents can be added or dropped, and a moved free-cancellation deadline re-arms its reminder.
 */
import { emitEvent } from '@cp/db';
import {
  BOOKINGS_RT,
  DomainError,
  editBookingPayloadSchema,
  type BookingResult,
  type EditBookingPayload,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import {
  armDeadlineReminder,
  emitFlightChange,
  writeAttachments,
  writeSegments,
} from '../../bookings/booking-writer';
import { armFlightWatch, segmentsOf } from '../../bookings/flight-watch';
import { syncBookedPlanItems } from '../../bookings/plan-sync';
import { defineCommand } from '../_framework/define-command';
import { sealBarcode, type BookingCommandDeps } from './deps';
import {
  loadBooking,
  publishBooking,
  requireBookingEditor,
  requireInTrip,
  requireVersion,
  type StoredBooking,
} from './shared';

type Patch = EditBookingPayload['patch'];

/** Column → value for every field the patch sets or clears (a fixed list: no caller-named SQL). */
function columnChanges(patch: Patch, deps: BookingCommandDeps): Map<string, unknown> {
  const set = new Map<string, unknown>();
  const put = (column: string, value: unknown) => {
    if (value !== undefined) set.set(column, value);
  };
  put('title', patch.title);
  put('starts_at', patch.starts_at);
  put('ends_at', patch.ends_at);
  put('tz', patch.tz);
  put('location', patch.location);
  put('traveller_ids', patch.traveller_ids);
  put('price_minor', patch.price?.amount_minor.toString());
  put('currency', patch.price?.currency);
  put('paid_by', patch.paid_by);
  put('supplier', patch.supplier);
  put('supplier_ref', patch.supplier_ref);
  put('free_cancel_until', patch.free_cancel_until);
  put('cancel_policy_text', patch.cancel_policy_text);
  put('status', patch.status);
  put('details', patch.details === undefined ? undefined : JSON.stringify(patch.details));
  const barcode = sealBarcode(deps, patch.barcode);
  if (barcode !== null) {
    set.set('barcode_payload_enc', barcode.payloadEnc);
    set.set('barcode_format', barcode.format);
  }
  for (const field of patch.clear ?? []) {
    if (field === 'price') {
      set.set('price_minor', null);
      set.set('currency', null);
    } else if (field === 'barcode') {
      set.set('barcode_payload_enc', null);
      set.set('barcode_format', null);
    } else {
      set.set(field, null);
    }
  }
  return set;
}

async function applyChanges(
  tx: pg.PoolClient,
  booking: StoredBooking,
  changes: Map<string, unknown>,
  version: number,
): Promise<{ tz: string | null; free_cancel_until: Date | null; traveller_ids: string[] }> {
  const columns = [...changes.keys()];
  const assignments = columns.map((column, index) => `${column} = $${index + 3}`);
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<{
      tz: string | null;
      free_cancel_until: Date | null;
      traveller_ids: string[];
    }>(
      `UPDATE bookings SET ${[...assignments, 'version = $2'].join(', ')} WHERE id = $1
       RETURNING tz, free_cancel_until, traveller_ids`,
      [booking.id, version, ...changes.values()],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'booking' });
    return row;
  });
}

export function createEditBookingCommand(deps: BookingCommandDeps) {
  return defineCommand({
    name: 'edit_booking',
    v: 1,
    schema: editBookingPayloadSchema,
    offline: true,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      const booking = await loadBooking(tx, payload.booking_id, ctx.uid);
      await requireBookingEditor(tx, booking, ctx.uid);
    },
    handle: async (tx, payload, ctx): Promise<BookingResult> => {
      const booking = await loadBooking(tx, payload.booking_id, ctx.uid, true);
      requireVersion(booking, payload.base_version);
      const { patch } = payload;
      if (patch.segments !== undefined && booking.type !== 'flight') {
        throw new DomainError('VALIDATION', { reason: 'segments_on_non_flight' });
      }
      await requireInTrip(tx, booking.trip_id, [
        ...(patch.traveller_ids ?? []),
        ...(patch.paid_by === undefined ? [] : [patch.paid_by]),
      ]);
      const version = booking.version + 1;
      const stored = await applyChanges(tx, booking, columnChanges(patch, deps), version);
      const owner = {
        id: booking.id,
        tripId: booking.trip_id,
        ownerId: booking.owner_id,
        visibility: booking.visibility,
        flightCrewVisible: booking.flight_crew_visible,
      };
      if (patch.segments !== undefined) {
        await writeSegments(tx, owner, patch.segments);
        await asSystemRole(tx, async () =>
          armFlightWatch(tx, await segmentsOf(tx, booking.id), ctx.clock.serverNow),
        );
      }
      if (patch.remove_attachments !== undefined) {
        await asSystemRole(tx, () =>
          tx.query(
            'DELETE FROM booking_attachments WHERE booking_id = $1 AND media_key = ANY($2)',
            [booking.id, patch.remove_attachments],
          ),
        );
      }
      if (patch.attachments !== undefined) {
        await writeAttachments(tx, owner, patch.attachments, ctx.uid);
      }
      await armDeadlineReminder(
        tx,
        {
          id: booking.id,
          tz: stored.tz,
          freeCancelUntil: patch.status === 'cancelled' ? null : stored.free_cancel_until,
        },
        ctx.clock.serverNow,
      );
      await syncBookedPlanItems(tx, booking.trip_id, ctx.uid);
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
      const flightMoved =
        patch.segments !== undefined ||
        patch.traveller_ids !== undefined ||
        patch.status === 'cancelled';
      if (booking.type === 'flight' && flightMoved) {
        const travellers = [...new Set([...booking.traveller_ids, ...stored.traveller_ids])];
        await emitFlightChange(
          tx,
          'booking.flight_changed',
          {
            id: booking.id,
            tripId: booking.trip_id,
            crewId: booking.crew_id,
          },
          travellers,
          ctx.uid,
        );
      }
      await publishBooking(tx, booking.crew_id, booking.visibility, BOOKINGS_RT.bookingEdited, {
        booking_id: booking.id,
        trip_id: booking.trip_id,
        version,
      });
      return { booking_id: booking.id, version };
    },
  });
}
