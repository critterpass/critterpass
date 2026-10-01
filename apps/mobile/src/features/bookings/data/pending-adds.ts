/**
 * A booking added on this phone shows in the wallet at once, while its `add_booking` is still in
 * the upload queue (or accepted and not yet synced back): its card is drawn from the queued
 * payload, and gives way to the synced row as soon as that arrives. Without this the wallet looked
 * as if SAVE did nothing for the 20–90 seconds a round trip takes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, wire values and JSON keys, never copy. */
import type { AddBookingPayload } from '@cp/domain';

import type { BookingRow, SegmentRow } from './queries';

export const PENDING_ADDS_SQL = `SELECT envelope FROM commands WHERE cmd = 'add_booking' ORDER BY seq`;
export const PENDING_ADDS_TABLES = ['commands'];

function payloadOf(envelope: string): AddBookingPayload | null {
  try {
    const parsed = JSON.parse(envelope) as { payload?: AddBookingPayload };
    return parsed.payload ?? null;
  } catch {
    return null;
  }
}

/** The queued adds for `tripId` as booking and leg rows, less the ones already synced. */
export function pendingAdds(
  envelopes: readonly { readonly envelope: string }[],
  tripId: string,
  uid: string | null,
  synced: ReadonlySet<string>,
): { readonly bookings: BookingRow[]; readonly segments: SegmentRow[] } {
  const bookings: BookingRow[] = [];
  const segments: SegmentRow[] = [];
  for (const { envelope } of envelopes) {
    const p = payloadOf(envelope);
    if (p === null || p.trip_id !== tripId || synced.has(p.booking_id)) continue;
    const owner = uid ?? '';
    bookings.push({
      id: p.booking_id,
      trip_id: p.trip_id,
      owner_id: owner,
      type: p.kind,
      title: p.title,
      starts_at: p.starts_at ?? null,
      ends_at: p.ends_at ?? null,
      tz: p.tz ?? null,
      location: p.location ?? null,
      traveller_ids: JSON.stringify(owner === '' ? [] : [owner]),
      price_minor: null,
      currency: null,
      paid_by: null,
      source: 'manual',
      supplier: null,
      supplier_ref: p.supplier_ref ?? null,
      free_cancel_until: null,
      cancel_policy_text: null,
      status: 'confirmed',
      visibility: 'personal',
      flight_crew_visible: 1,
      details: p.details === undefined ? null : JSON.stringify(p.details),
      barcode_format: null,
      version: 0,
    });
    (p.segments ?? []).forEach((leg, index) => {
      segments.push({
        id: `${p.booking_id}:${String(index + 1)}`,
        booking_id: p.booking_id,
        owner_id: owner,
        crew_visible: 1,
        segment_no: index + 1,
        carrier: leg.carrier,
        flight_no: leg.flight_no,
        dep_airport: leg.dep_airport,
        arr_airport: leg.arr_airport,
        sched_dep_at: leg.sched_dep_at,
        sched_arr_at: leg.sched_arr_at ?? null,
        est_dep_at: null,
        est_arr_at: null,
        act_dep_at: null,
        act_arr_at: null,
        boarding_at: null,
        boarding_estimated: 1,
        gate: null,
        terminal: null,
        status: 'scheduled',
        delay_min: null,
        status_source: null,
        status_at: null,
      });
    });
  }
  return { bookings, segments };
}
