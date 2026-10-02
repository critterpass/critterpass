/**
 * The booking form's draft (undesigned: adding by hand, or correcting a card): plain text fields
 * the traveller types as the confirmation prints them, turned into `add_booking` /
 * `edit_booking` payloads. Dates and times are read in the booking's own time zone and sent as
 * ISO instants with that zone's offset; a flight's departure is read on its departure airport's
 * clock and its landing on its arrival airport's (the bundled airports' zones), so a flight across
 * zones lands when the ticket says.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and date patterns, never copy. */
import type {
  AddBookingPayload,
  BookingDetails,
  BookingKind,
  EditBookingPayload,
} from '@cp/domain';

import type { WalletBooking } from '../data/model';
import { flightZones, wallOf, zonedIso } from './zoned-time';

export { flightZones, offsetMinutes, wallOf, zonedIso, zoneName } from './zoned-time';

export interface BookingDraft {
  readonly kind: BookingKind;
  readonly title: string;
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** `HH:MM`, 24 h. */
  readonly time: string;
  /** Flights: when it lands, `HH:MM` as the ticket prints it. */
  readonly arrive: string;
  /** Stays: check-out day, `YYYY-MM-DD`. */
  readonly endDate: string;
  readonly location: string;
  readonly ref: string;
  /** Flights: "SQ 938", "SIN", "DPS". */
  readonly flight: string;
  readonly from: string;
  readonly to: string;
  readonly seat: string;
  readonly notes: string;
}

export type DraftProblem = 'title' | 'date' | 'time' | 'arrive' | 'flight' | 'airports';

const TIME = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/u;
const FLIGHT = /^([A-Z0-9]{2}|[A-Z]{3})\s*([0-9]{1,4}[A-Z]?)$/u;
const IATA = /^[A-Z]{3}$/u;

export function emptyDraft(kind: BookingKind, title = ''): BookingDraft {
  return {
    kind,
    title,
    date: '',
    time: '',
    arrive: '',
    endDate: '',
    location: '',
    ref: '',
    flight: '',
    from: '',
    to: '',
    seat: '',
    notes: '',
  };
}

/** The zone a draft's start is read in: a flight's departure airport, else the booking's. */
function startZone(draft: BookingDraft, tz: string): string {
  return draft.kind === 'flight' ? flightZones(draft, tz).dep : tz;
}

export function draftOf(booking: WalletBooking, tz: string): BookingDraft {
  const leg = booking.segments[0];
  const zones = flightZones({ from: leg?.dep_airport ?? '', to: leg?.arr_airport ?? '' }, tz);
  const start = wallOf(leg?.sched_dep_at ?? booking.startsAt, leg === undefined ? tz : zones.dep);
  return {
    kind: booking.kind,
    title: booking.title,
    date: start.date,
    time: start.time,
    arrive: wallOf(leg?.sched_arr_at ?? null, zones.arr).time,
    endDate: wallOf(booking.endsAt, tz).date,
    location: booking.location ?? '',
    ref: booking.supplierRef ?? '',
    flight: leg === undefined ? '' : `${leg.carrier} ${leg.flight_no}`,
    from: leg?.dep_airport ?? '',
    to: leg?.arr_airport ?? '',
    seat: booking.details.seat ?? '',
    notes: booking.details.notes ?? '',
  };
}

export function problemsOf(draft: BookingDraft, tz: string): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (draft.kind !== 'flight' && draft.title.trim() === '') problems.push('title');
  const startTz = startZone(draft, tz);
  if (draft.date.trim() !== '' || draft.kind === 'flight') {
    if (zonedIso(draft.date, '00:00', startTz) === null) problems.push('date');
    else if (draft.time.trim() !== '' && zonedIso(draft.date, draft.time, startTz) === null) {
      problems.push('time');
    }
  }
  if (draft.kind === 'flight') {
    if (draft.arrive.trim() !== '' && TIME.exec(draft.arrive.trim()) === null) {
      problems.push('arrive');
    }
    if (FLIGHT.exec(draft.flight.trim().toUpperCase()) === null) problems.push('flight');
    if (!IATA.test(draft.from.trim().toUpperCase()) || !IATA.test(draft.to.trim().toUpperCase())) {
      problems.push('airports');
    }
  }
  return problems;
}

function detailsOf(draft: BookingDraft, base: BookingDetails): BookingDetails {
  const details: Record<string, unknown> = { ...base };
  const set = (key: keyof BookingDetails, value: string) => {
    if (value.trim() === '') delete details[key];
    else details[key] = value.trim();
  };
  if (draft.kind === 'flight') set('seat', draft.seat.toUpperCase());
  set('notes', draft.notes);
  return details;
}

/**
 * When a flight lands: the first moment after it leaves that reads the arrival time on the arrival
 * airport's clock (the same day, the next for an overnight flight, or the day before for one that
 * crosses the date line eastwards). Null without an arrival time.
 */
export function arrivalIso(draft: BookingDraft, tz: string): string | null {
  if (draft.kind !== 'flight' || draft.arrive.trim() === '') return null;
  const zones = flightZones(draft, tz);
  const departs = zonedIso(draft.date, draft.time, zones.dep);
  if (departs === null) return null;
  const base = Date.parse(`${draft.date.trim()}T00:00:00Z`);
  for (const offset of [-1, 0, 1, 2]) {
    const day = new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
    const lands = zonedIso(day, draft.arrive, zones.arr);
    if (lands === null) return null;
    if (Date.parse(lands) > Date.parse(departs)) return lands;
  }
  return null;
}

function timesOf(draft: BookingDraft, tz: string) {
  const startsAt =
    draft.date.trim() === '' ? null : zonedIso(draft.date, draft.time, startZone(draft, tz));
  const endsAt =
    draft.kind === 'stay' && draft.endDate.trim() !== ''
      ? zonedIso(draft.endDate, '', tz)
      : arrivalIso(draft, tz);
  return { startsAt, endsAt };
}

function segmentOf(draft: BookingDraft, startsAt: string, tz: string) {
  const match = FLIGHT.exec(draft.flight.trim().toUpperCase());
  const arrivesAt = arrivalIso(draft, tz);
  return {
    carrier: match?.[1] ?? '',
    flight_no: match?.[2] ?? '',
    dep_airport: draft.from.trim().toUpperCase(),
    arr_airport: draft.to.trim().toUpperCase(),
    sched_dep_at: startsAt,
    ...(arrivesAt === null ? {} : { sched_arr_at: arrivesAt }),
  };
}

function titleOf(draft: BookingDraft): string {
  if (draft.kind !== 'flight' || draft.title.trim() !== '') return draft.title.trim();
  const flight = draft.flight.trim().toUpperCase();
  return `${flight} ${draft.from.trim().toUpperCase()} → ${draft.to.trim().toUpperCase()}`;
}

/** The `add_booking` payload, or null while the draft has a problem. */
export function toAddPayload(
  draft: BookingDraft,
  ids: { readonly bookingId: string; readonly tripId: string },
  tz: string,
): AddBookingPayload | null {
  if (problemsOf(draft, tz).length > 0) return null;
  const { startsAt, endsAt } = timesOf(draft, tz);
  const details = detailsOf(draft, {});
  return {
    booking_id: ids.bookingId,
    trip_id: ids.tripId,
    kind: draft.kind,
    title: titleOf(draft),
    tz: startZone(draft, tz),
    ...(startsAt === null ? {} : { starts_at: startsAt }),
    ...(endsAt === null ? {} : { ends_at: endsAt }),
    ...(draft.location.trim() === '' ? {} : { location: draft.location.trim() }),
    ...(draft.ref.trim() === '' ? {} : { supplier_ref: draft.ref.trim() }),
    ...(Object.keys(details).length === 0 ? {} : { details }),
    ...(draft.kind === 'flight' && startsAt !== null
      ? { segments: [segmentOf(draft, startsAt, tz)] }
      : {}),
  };
}

/** The `edit_booking` payload for what changed, or null when nothing did (or it has a problem). */
export function toEditPayload(
  draft: BookingDraft,
  booking: WalletBooking,
  tz: string,
): EditBookingPayload | null {
  if (problemsOf(draft, tz).length > 0) return null;
  const before = draftOf(booking, tz);
  const patch: EditBookingPayload['patch'] & Record<string, unknown> = {};
  const clear: NonNullable<EditBookingPayload['patch']['clear']> = [];
  const { startsAt, endsAt } = timesOf(draft, tz);
  if (draft.title.trim() !== before.title) patch.title = titleOf(draft);
  if (draft.date !== before.date || draft.time !== before.time) {
    if (startsAt === null) clear.push('starts_at');
    else patch.starts_at = startsAt;
  }
  const flightMoved =
    draft.kind === 'flight' &&
    (draft.date !== before.date || draft.time !== before.time || draft.arrive !== before.arrive);
  if (flightMoved && startsAt !== null) patch.segments = [segmentOf(draft, startsAt, tz)];
  // A flight's end is its landing: it moves with the departure, and goes when the time is cleared.
  const landingMoved = flightMoved && (draft.arrive.trim() !== '' || before.arrive !== '');
  if (draft.endDate !== before.endDate || landingMoved) {
    if (endsAt === null) clear.push('ends_at');
    else patch.ends_at = endsAt;
  }
  if (draft.location.trim() !== before.location) {
    if (draft.location.trim() === '') clear.push('location');
    else patch.location = draft.location.trim();
  }
  if (draft.ref.trim() !== before.ref) {
    if (draft.ref.trim() === '') clear.push('supplier_ref');
    else patch.supplier_ref = draft.ref.trim();
  }
  if (
    draft.kind === 'flight' &&
    startsAt !== null &&
    (draft.flight !== before.flight || draft.from !== before.from || draft.to !== before.to)
  ) {
    patch.segments = [segmentOf(draft, startsAt, tz)];
  }
  if (draft.seat !== before.seat || draft.notes !== before.notes) {
    patch.details = detailsOf(draft, booking.details);
  }
  if (clear.length > 0) patch.clear = clear;
  if (Object.keys(patch).length === 0) return null;
  return { booking_id: booking.id, base_version: booking.version, patch };
}
