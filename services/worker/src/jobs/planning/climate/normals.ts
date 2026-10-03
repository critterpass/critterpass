/**
 * The usual chance of rain by hour for a month at one place: the share of sampled past days on
 * which it rained in that local hour. Sampled, not exhaustive: ten days of the month in each of
 * the last three years (thirty history calls a month), kept until a destination's row is missing.
 */
import type { HistoryDay } from '../../../travel-data/weatherapi-client';

/** Days of the month sampled (all exist in every month). */
export const SAMPLE_DAYS = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28] as const;
export const SAMPLE_YEARS = 3;
/** Fewer usable days than this and the month is not stored (the reader falls back to nothing). */
export const MIN_SAMPLES = 15;

/** The dates sampled for `month` (1-12): the last three full years before `now`'s year. */
export function sampleDates(month: number, now: Date): string[] {
  const year = now.getUTCFullYear();
  const dates: string[] = [];
  for (let back = 1; back <= SAMPLE_YEARS; back += 1) {
    for (const day of SAMPLE_DAYS) {
      dates.push(
        `${year - back}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      );
    }
  }
  return dates;
}

/** The 0.1° grid cell holding a point, named by its south-west corner (`lat,lng`). */
export function cellOf(point: { readonly lat: number; readonly lng: number }): string {
  const floor = (value: number) => (Math.floor(Math.round(value * 1e6) / 1e5) / 10).toFixed(1);
  return `${floor(point.lat)},${floor(point.lng)}`;
}

/** Percent of sampled days wet in each local hour, 0-100. */
export function rainNormals(days: readonly HistoryDay[]): number[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const wet = days.filter((day) => day.wet[hour] === true).length;
    return days.length === 0 ? 0 : Math.round((wet / days.length) * 100);
  });
}

/** Distinct years behind a set of samples. */
export function yearsOf(days: readonly HistoryDay[]): number {
  return new Set(days.map((day) => day.date.slice(0, 4))).size;
}
