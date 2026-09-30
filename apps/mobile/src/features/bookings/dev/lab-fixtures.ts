/**
 * The Bali Six wallet as the 3h-1 and 3h-2 designs draw it, for the (dev) bookings lab and the
 * wallet's tests: Winston's SQ 938 with Maya and Alex on board, the Batur trek, the Sanur →
 * Penida boat, Villa Kayu Manis, and two finds from Alex's inbox (the Kura Kura fast boat, the
 * airport transfer).
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names and ids, only in the (dev) lab. */
import type { ExtractedBooking } from '@cp/domain';

import type { BookingRow, CandidateRow, SegmentRow } from '../data/queries';
import type { WalletMember } from '../data/use-wallet-context';

export const LAB_UID = 'u-winston';
export const LAB_TRIP = 't-bali';
export const LAB_TZ = 'Asia/Makassar';
export const LAB_NOW = Date.parse('2026-10-10T09:00:00+08:00');

export const LAB_MEMBERS: readonly WalletMember[] = [
  ['u-winston', 'Winston'],
  ['u-maya', 'Maya'],
  ['u-alex', 'Alex'],
  ['u-jordan', 'Jordan'],
  ['u-rin', 'Rin'],
  ['u-dev', 'Dev'],
].map(([userId = '', name = '']) => ({ userId, name }));

export function labBooking(
  id: string,
  type: string,
  title: string,
  startsAt: string | null,
  extra: Partial<BookingRow> = {},
): BookingRow {
  return {
    id,
    trip_id: LAB_TRIP,
    owner_id: LAB_UID,
    type,
    title,
    starts_at: startsAt,
    ends_at: null,
    tz: LAB_TZ,
    location: null,
    traveller_ids: JSON.stringify(LAB_MEMBERS.map((member) => member.userId)),
    price_minor: null,
    currency: null,
    paid_by: null,
    source: 'forward',
    supplier: null,
    supplier_ref: null,
    free_cancel_until: null,
    cancel_policy_text: null,
    status: 'booked',
    visibility: 'crew',
    flight_crew_visible: 1,
    details: null,
    barcode_format: null,
    version: 1,
    ...extra,
  };
}

export function labSegment(
  id: string,
  ownerId: string,
  bookingId: string,
  extra: Partial<SegmentRow> = {},
): SegmentRow {
  return {
    id,
    booking_id: bookingId,
    owner_id: ownerId,
    crew_visible: 1,
    segment_no: 1,
    carrier: 'SQ',
    flight_no: '938',
    dep_airport: 'SIN',
    arr_airport: 'DPS',
    sched_dep_at: '2026-10-12T09:05:00+08:00',
    sched_arr_at: '2026-10-12T11:40:00+08:00',
    est_dep_at: null,
    est_arr_at: null,
    act_dep_at: null,
    act_arr_at: null,
    boarding_at: '2026-10-12T08:25:00+08:00',
    boarding_estimated: 0,
    gate: 'B7',
    terminal: '3',
    status: 'on_time',
    delay_min: 0,
    status_source: 'flightaware',
    status_at: '2026-10-12T01:12:00Z',
    ...extra,
  };
}

export const LAB_FLIGHT = labBooking('b-flight', 'flight', 'SQ 938 SIN → DPS', null, {
  visibility: 'personal',
  traveller_ids: JSON.stringify([LAB_UID]),
  supplier: 'airline',
  supplier_ref: 'K7PQ2Z',
  details: JSON.stringify({ seat: '34A', baggage: '23kg', cabin: 'Economy' }),
  barcode_format: 'pdf417',
});

export const LAB_BOOKINGS: readonly BookingRow[] = [
  LAB_FLIGHT,
  labBooking('b-trek', 'activity', 'Batur sunrise trek', '2026-10-15T03:30:00+08:00', {
    location: 'Pickup at Villa Kayu Manis',
    supplier_ref: 'KL-44821',
    free_cancel_until: '2026-10-14T03:30:00+08:00',
    cancel_policy_text: 'Free cancellation up to 24 hours before the start time.',
  }),
  labBooking('b-boat', 'boat', 'Sanur → Penida', '2026-10-16T08:30:00+08:00', {
    location: 'Sanur harbour, Matahari Terbit beach',
  }),
  labBooking('b-villa', 'stay', 'Villa Kayu Manis', '2026-10-12T15:00:00+08:00', {
    ends_at: '2026-10-17T11:00:00+08:00',
    location: 'Jl. Raya Sayan, Ubud',
    price_minor: 282000,
    currency: 'USD',
    paid_by: 'u-maya',
  }),
];

export const LAB_SEGMENTS: readonly SegmentRow[] = [
  labSegment('s-winston', LAB_UID, 'b-flight'),
  labSegment('s-maya', 'u-maya', 'b-flight-maya'),
  labSegment('s-alex', 'u-alex', 'b-flight-alex'),
];

export const LAB_PASS = 'M1TAN/WINSTON         EK7PQ2Z SINDPSSQ 0938 285Y034A0042 100';

function extracted(fields: Partial<ExtractedBooking> & Pick<ExtractedBooking, 'kind' | 'title'>) {
  const base: ExtractedBooking = {
    supplier: 'other',
    supplier_name: null,
    supplier_ref: null,
    starts_at: null,
    ends_at: null,
    tz: LAB_TZ,
    location: null,
    price: null,
    travellers: [],
    free_cancel_until: null,
    cancel_policy_text: null,
    segments: [],
    details: {},
    barcode: null,
    extracted_by: 'jsonld',
    ...fields,
  };
  return JSON.stringify(base);
}

export function labCandidate(id: string, extra: Partial<CandidateRow> = {}): CandidateRow {
  return {
    id,
    user_id: 'u-alex',
    crew_id: 'c-bali',
    trip_id: LAB_TRIP,
    source: 'mailbox',
    extracted: null,
    status: 'pending',
    crew_visible: 1,
    needs_confirm: 0,
    failure_reason: null,
    duplicate_of_id: null,
    created_at: '2026-10-09T08:00:00Z',
    ...extra,
  };
}

export const LAB_CANDIDATES: readonly CandidateRow[] = [
  labCandidate('c-boat', {
    extracted: extracted({
      kind: 'boat',
      title: 'Kura Kura fast boat',
      supplier_name: 'Kura Kura',
      starts_at: '2026-10-16T08:30:00+08:00',
      location: 'Sanur → Penida',
      travellers: ['Winston', 'Maya', 'Alex', 'Jordan', 'Rin', 'Dev'],
      price: { amount_minor: 22800, currency: 'USD' },
    }),
  }),
  labCandidate('c-transfer', {
    user_id: LAB_UID,
    source: 'forward',
    extracted: extracted({
      kind: 'transfer',
      title: 'Airport transfer',
      starts_at: '2026-10-12T11:40:00+08:00',
      travellers: ['Winston'],
      price: { amount_minor: 3600, currency: 'USD' },
    }),
  }),
];
