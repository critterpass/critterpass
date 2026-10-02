/**
 * The stamps a person holds, as the profile row and the stamps list print them: the home stamp,
 * the trips they went on, the past trips they reported themselves (dashed, SELF-REPORTED) and the
 * next trip's dashed stamp. Pure, so ordering and odd rows are checked in tests; copy stays in the
 * views.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, never copy. */
import type { PastTripRow, StampRow } from '../profile/profile-queries';

/** Stamps on the profile row before "ALL n ›" takes over. */
export const STAMPS_SHOWN = 5;

export interface ProfileStamp {
  readonly id: string;
  /** `self`: a past trip the person reported; it counts as a trip and a country, never a critter. */
  readonly kind: 'home' | 'trip' | 'upcoming' | 'self';
  /** The place's name, the home airport's code, or a self-reported trip's country code. */
  readonly title: string;
  /** First day of the trip (`YYYY-MM-DD`), when known. */
  readonly date: string | null;
  /** Whole days until an upcoming trip starts; null when it has no date yet. */
  readonly daysUntil: number | null;
  /** The destination's own ink, when it has one. */
  readonly ink: string | null;
  /** The in-app trip the stamp was earned on, for its recap. */
  readonly tripId: string | null;
}

const DAY_MS = 86_400_000;

function day(value: string): number {
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

/** Whole days from `today` to `date`; negative once it has passed. */
export function daysBetween(today: string, date: string): number {
  return Math.round((day(date) - day(today)) / DAY_MS);
}

/** The first day of a `[2024-06-01,2024-06-09)` range. */
function rangeStart(range: string | null): string | null {
  return range === null ? null : (/\d{4}-\d{2}-\d{2}/.exec(range)?.[0] ?? null);
}

function stampOf(row: StampRow, today: string): ProfileStamp | null {
  const tripId = row.trip_id ?? null;
  if (row.kind === 'home') {
    if (row.iata === null) return null;
    return {
      id: row.id,
      kind: 'home',
      title: row.iata,
      date: null,
      daysUntil: null,
      ink: null,
      tripId: null,
    };
  }
  const title = row.destination_name;
  if (title === null) return null;
  const date = rangeStart(row.dates) ?? row.trip_start ?? row.stamped_at?.slice(0, 10) ?? null;
  const ink = row.ink_colour ?? row.destination_colour;
  if (row.status === 'upcoming') {
    const daysUntil = date === null ? null : Math.max(0, daysBetween(today, date));
    return { id: row.id, kind: 'upcoming', title, date, daysUntil, ink, tripId };
  }
  return { id: row.id, kind: 'trip', title, date, daysUntil: null, ink, tripId };
}

function pastStampOf(row: PastTripRow): ProfileStamp {
  return {
    id: row.id,
    kind: 'self',
    title: row.country,
    date: row.month.slice(0, 10),
    daysUntil: null,
    ink: null,
    tripId: null,
  };
}

/** Newest first (trips and self-reported ones together), then home, then what is still to come. */
export function orderStamps(
  rows: readonly StampRow[],
  pastTrips: readonly PastTripRow[],
  today: string,
): ProfileStamp[] {
  const stamps = [
    ...rows.flatMap((row) => {
      const stamp = stampOf(row, today);
      return stamp === null ? [] : [stamp];
    }),
    ...pastTrips.map(pastStampOf),
  ];
  const byDateDesc = (a: ProfileStamp, b: ProfileStamp) =>
    (b.date ?? '').localeCompare(a.date ?? '') || a.id.localeCompare(b.id);
  const travelled = stamps
    .filter((stamp) => stamp.kind === 'trip' || stamp.kind === 'self')
    .sort(byDateDesc);
  const home = stamps.filter((stamp) => stamp.kind === 'home');
  const upcoming = stamps
    .filter((stamp) => stamp.kind === 'upcoming')
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return [...travelled, ...home, ...upcoming];
}

/** At most `STAMPS_SHOWN`, always keeping the next trip's dashed stamp in view. */
export function visibleStamps(ordered: readonly ProfileStamp[]): ProfileStamp[] {
  if (ordered.length <= STAMPS_SHOWN) return [...ordered];
  const next = ordered.find((stamp) => stamp.kind === 'upcoming');
  const rest = ordered.filter((stamp) => stamp !== next);
  return next === undefined
    ? rest.slice(0, STAMPS_SHOWN)
    : [...rest.slice(0, STAMPS_SHOWN - 1), next];
}

/** The years a stamps list can filter by, newest first; stamps with no date have none. */
export function stampYears(stamps: readonly ProfileStamp[]): number[] {
  const years = new Set<number>();
  for (const stamp of stamps) if (stamp.date !== null) years.add(Number(stamp.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

/** The stamps list: oldest first ("chronological"), the year filter applied, undated last. */
export function stampsForYear(
  ordered: readonly ProfileStamp[],
  year: number | null,
): ProfileStamp[] {
  const dated = ordered
    .filter((stamp) => stamp.date !== null)
    .filter((stamp) => year === null || Number(stamp.date?.slice(0, 4)) === year)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id));
  if (year !== null) return dated;
  return [...dated, ...ordered.filter((stamp) => stamp.date === null)];
}
