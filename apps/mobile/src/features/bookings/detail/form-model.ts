/**
 * The booking form's draft (undesigned: adding by hand, or correcting a card): plain text fields
 * the traveller types as the confirmation prints them, turned into `add_booking` /
 * `edit_booking` payloads. Dates and times are read in the booking's own time zone and sent as
 * ISO instants with that zone's offset.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and date patterns, never copy. */
import type {
  AddBookingPayload,
  BookingDetails,
  BookingKind,
  EditBookingPayload,
} from '@cp/domain';

import type { WalletBooking } from '../data/model';

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

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
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

/** Minutes east of UTC that `tz` observes at `utcMs`. */
export function offsetMinutes(tz: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/**
 * How the form names the zone its times are read in: the zone's city and its offset now
 * ("Ho Chi Minh", "GMT+7"; "Kolkata", "GMT+5:30").
 */
export function zoneName(tz: string, utcMs: number): { city: string; offset: string } {
  const minutes = offsetMinutes(tz, utcMs);
  const abs = Math.abs(minutes);
  const rest = abs % 60 === 0 ? '' : `:${String(abs % 60).padStart(2, '0')}`;
  return {
    city: (tz.split('/').pop() ?? tz).replace(/_/gu, ' '),
    offset: `GMT${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60))}${rest}`,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** "2026-10-12" + "09:05" in Asia/Singapore → "2026-10-12T09:05:00+08:00"; null when unreadable. */
export function zonedIso(date: string, time: string, tz: string): string | null {
  const d = DATE.exec(date.trim());
  const t = TIME.exec((time.trim() === '' ? '00:00' : time).trim());
  if (d === null || t === null) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(wall).getUTCDate() !== day) return null;
  let offset = offsetMinutes(tz, wall);
  offset = offsetMinutes(tz, wall - offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${String(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The wall-clock date and time of an instant in `tz`. */
export function wallOf(iso: string | null, tz: string): { date: string; time: string } {
  if (iso === null) return { date: '', time: '' };
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return { date: '', time: '' };
  const local = new Date(ms + offsetMinutes(tz, ms) * 60_000);
  return {
    date: `${String(local.getUTCFullYear())}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  };
}

export function draftOf(booking: WalletBooking, tz: string): BookingDraft {
  const leg = booking.segments[0];
  const start = wallOf(leg?.sched_dep_at ?? booking.startsAt, tz);
  return {
    kind: booking.kind,
    title: booking.title,
    date: start.date,
    time: start.time,
    arrive: wallOf(leg?.sched_arr_at ?? null, tz).time,
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
  if (draft.date.trim() !== '' || draft.kind === 'flight') {
    if (zonedIso(draft.date, '00:00', tz) === null) problems.push('date');
    else if (draft.time.trim() !== '' && zonedIso(draft.date, draft.time, tz) === null) {
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
 * When a flight lands: the arrival time on the departure day, or on the next day when it reads
 * earlier than the departure (an overnight flight). Null without an arrival time.
 */
export function arrivalIso(draft: BookingDraft, tz: string): string | null {
  if (draft.kind !== 'flight' || draft.arrive.trim() === '') return null;
  const sameDay = zonedIso(draft.date, draft.arrive, tz);
  const departs = zonedIso(draft.date, draft.time, tz);
  if (sameDay === null || departs === null) return null;
  if (Date.parse(sameDay) > Date.parse(departs)) return sameDay;
  const nextDay = new Date(Date.parse(`${draft.date.trim()}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return zonedIso(nextDay, draft.arrive, tz);
}

function timesOf(draft: BookingDraft, tz: string) {
  const startsAt = draft.date.trim() === '' ? null : zonedIso(draft.date, draft.time, tz);
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
    tz,
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
