/**
 * A pasted flight number on its own ("9G 956", "9G956 2 Oct", "2/10 VJ 123"): nothing to read, so
 * the flight's schedule is looked up instead. The date is the one typed, else the trip's days; one
 * provider call covers them. A flight that flies daily matches on several days, so a trip date is
 * picked only when the traveller's home airport says which (out on the first day, home on the
 * last) or when one day matches. The result is a normal flight extraction, its times on each
 * airport's own clock (the provider's zone, else the bundled airport's).
 */
import { airportZone } from '@cp/content/airports';
import { emptyExtraction, type ExtractedBooking } from '@cp/domain';
import { splitIdent, type FlightSnapshot } from '@cp/suppliers';

export interface PastedFlight {
  readonly carrier: string;
  readonly number: string;
  /** `YYYY-MM-DD`, when a date was typed with it. */
  readonly date: string | null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** The provider answers at most seven days of departures in one call. */
export const MAX_LOOKUP_DAYS = 7;

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(year: number, month: number, day: number): string | null {
  const at = new Date(Date.UTC(year, month - 1, day));
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null;
  return `${String(year)}-${pad(month)}-${pad(day)}`;
}

function monthOf(word: string): number | null {
  const index = MONTHS.indexOf(word.slice(0, 3));
  return index < 0 ? null : index + 1;
}

/** A typed date in the usual shapes; a missing year is the next one on or after `reference`. */
export function readDate(text: string, reference: string): string | null {
  const t = text
    .toUpperCase()
    .replace(/^NGÀY\s+/u, '')
    .replace(/[,.]$/u, '')
    .trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(t);
  if (iso !== null) return isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const numeric = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/u.exec(t);
  const dayMonth = /^(\d{1,2})\s*(?:THÁNG\s*(\d{1,2})|([A-Z]{3,9}))(?:\s+(\d{4}))?$/u.exec(t);
  const monthDay = /^([A-Z]{3,9})\s+(\d{1,2})(?:\s+(\d{4}))?$/u.exec(t);
  if (numeric !== null) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    year = numeric[3] === undefined ? null : Number(numeric[3].padStart(4, '20'));
  } else if (dayMonth !== null) {
    day = Number(dayMonth[1]);
    month = dayMonth[2] === undefined ? monthOf(dayMonth[3] ?? '') : Number(dayMonth[2]);
    year = dayMonth[4] === undefined ? null : Number(dayMonth[4]);
  } else if (monthDay !== null) {
    month = monthOf(monthDay[1] ?? '');
    day = Number(monthDay[2]);
    year = monthDay[3] === undefined ? null : Number(monthDay[3]);
  }
  if (day === null || month === null) return null;
  if (year !== null) return isoDate(year, month, day);
  const base = Number(reference.slice(0, 4));
  const same = isoDate(base, month, day);
  if (same === null) return null;
  // A date well before the reference means next year's.
  return Date.parse(same) < Date.parse(reference) - 60 * 86_400_000
    ? isoDate(base + 1, month, day)
    : same;
}

/** The paste when it is just a flight number with an optional date, else null. */
export function readPastedFlight(text: string, reference: string): PastedFlight | null {
  const t = text.trim().replace(/\s+/gu, ' ');
  if (t.length === 0 || t.length > 40) return null;
  const ident = /^([A-Z0-9]{2}\s?\d{1,4}[A-Z]?)\b\s*(.*)$/iu.exec(t);
  const trailing = /^(.*?)\s*\b([A-Z0-9]{2}\s?\d{1,4}[A-Z]?)$/iu.exec(t);
  for (const [flight, rest] of [
    [ident?.[1], ident?.[2]],
    [trailing?.[2], trailing?.[1]],
  ] as const) {
    if (flight === undefined) continue;
    const split = splitIdent(flight);
    if (split === null || !/[A-Z]/u.test(split.carrier)) continue;
    const typed = (rest ?? '').trim();
    if (typed === '') return { ...split, date: null };
    const date = readDate(typed, reference);
    if (date !== null) return { ...split, date };
  }
  return null;
}

export interface LookupWindow {
  readonly from: string;
  readonly to: string;
}

/** The local departure dates to ask about: the typed date, else the trip's days (at most seven). */
export function lookupWindow(
  pasted: PastedFlight,
  trip: { readonly start: string | null; readonly end: string | null },
): LookupWindow | null {
  if (pasted.date !== null) return { from: pasted.date, to: pasted.date };
  if (trip.start === null) return null;
  const end = trip.end ?? trip.start;
  const days = (Date.parse(end) - Date.parse(trip.start)) / 86_400_000 + 1;
  if (days < 1 || days > MAX_LOOKUP_DAYS) return null;
  return { from: trip.start, to: end };
}

function localDate(at: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(at));
}

function depZone(flight: FlightSnapshot, fallback: string): string {
  return flight.depTz ?? airportZone(flight.depAirport ?? '') ?? fallback;
}

/** The one flight the paste means, or null when none (or more than one) fits. */
export function pickFlight(
  found: readonly FlightSnapshot[],
  pasted: PastedFlight,
  context: {
    readonly window: LookupWindow;
    readonly home: string | null;
    readonly tz: string;
  },
): FlightSnapshot | null {
  const flights = found.filter(
    (f) => f.schedDepAt !== null && f.depAirport !== null && f.arrAirport !== null,
  );
  const on = (date: string) =>
    flights.filter((f) => localDate(f.schedDepAt as string, depZone(f, context.tz)) === date);
  if (pasted.date !== null) return on(pasted.date)[0] ?? null;
  const { from, to } = context.window;
  if (context.home !== null) {
    const out = on(from).find((f) => f.depAirport === context.home);
    if (out !== undefined) return out;
    const back = on(to).find((f) => f.arrAirport === context.home);
    if (back !== undefined) return back;
  }
  return flights.length === 1 ? (flights[0] ?? null) : null;
}

/** The flight as an extraction, like one read from a confirmation. */
export function flightExtraction(flight: FlightSnapshot, fallbackTz: string): ExtractedBooking {
  const carrier = flight.carrier;
  const dep = flight.depAirport ?? '';
  const arr = flight.arrAirport ?? '';
  const schedDep = flight.schedDepAt ?? '';
  return {
    ...emptyExtraction('flight', `${carrier} ${flight.flightNo} · ${dep} → ${arr}`, 'schedule'),
    starts_at: schedDep,
    ends_at: flight.schedArrAt,
    tz: depZone(flight, fallbackTz),
    segments: [
      {
        carrier,
        flight_no: flight.flightNo,
        dep_airport: dep,
        arr_airport: arr,
        sched_dep_at: schedDep,
        ...(flight.schedArrAt === null ? {} : { sched_arr_at: flight.schedArrAt }),
        ...(flight.terminal === null ? {} : { terminal: flight.terminal.slice(0, 8) }),
      },
    ],
  };
}
