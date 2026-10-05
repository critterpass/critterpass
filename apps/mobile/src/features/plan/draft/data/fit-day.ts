/**
 * The day to open Change a day on when something has to be fitted in (a must-do added after the
 * draft, or one that did not make it): the day with the most room. Arrival and departure days are
 * short already, so a middle day wins a tie against them; among equals, the earliest.
 */
import type { ReviewDay } from './version';

export function roomiestDay(days: readonly ReviewDay[]): number | undefined {
  const sorted = [...days].sort((a, b) => a.dayNo - b.dayNo);
  const first = sorted[0]?.dayNo;
  const last = sorted[sorted.length - 1]?.dayNo;
  const middle = sorted.filter((day) => day.dayNo !== first && day.dayNo !== last);
  const pool = middle.length > 0 ? middle : sorted;
  return pool.reduce<ReviewDay | undefined>(
    (best, day) => (best === undefined || day.stops.length < best.stops.length ? day : best),
    undefined,
  )?.dayNo;
}
