/**
 * The "Add a past trip" form's rules: a country and a month, the month no later than this one
 * (a past trip is in the past), and the countries searchable by their name in the app's language
 * or by code.
 */
import type { PastTripDraft } from './past-trips';

export interface CountryOption {
  readonly code: string;
  readonly name: string;
}

/** How far back the year chips go. */
export const PAST_TRIP_YEARS = 60;

/** The years offered, newest first, from `today`'s year back. */
export function pastTripYears(today: string): number[] {
  const year = Number(today.slice(0, 4));
  return Array.from({ length: PAST_TRIP_YEARS }, (_, index) => year - index);
}

/** `YYYY-MM` once both halves are picked and the month is not still to come. */
export function draftOf(
  country: string | null,
  year: number | null,
  month: number | null,
  today: string,
): PastTripDraft | null {
  if (country === null || year === null || month === null) return null;
  const value = `${year}-${String(month).padStart(2, '0')}`;
  if (value > today.slice(0, 7)) return null;
  return { country, month: value };
}

/** Months of `year` that can be picked on `today` (1-based). */
export function monthsOpen(year: number | null, today: string): ReadonlySet<number> {
  const thisYear = Number(today.slice(0, 4));
  const last = year === thisYear ? Number(today.slice(5, 7)) : 12;
  return new Set(Array.from({ length: last }, (_, index) => index + 1));
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Countries whose name (or code) contains `query`, names starting with it first. */
export function searchCountries(
  options: readonly CountryOption[],
  query: string,
  limit = 8,
): CountryOption[] {
  const q = fold(query.trim());
  if (q.length === 0) return [];
  const hits = options.filter(
    (option) => fold(option.name).includes(q) || option.code.toLowerCase() === q,
  );
  const starts = (option: CountryOption) => (fold(option.name).startsWith(q) ? 0 : 1);
  return hits.sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name)).slice(0, limit);
}
