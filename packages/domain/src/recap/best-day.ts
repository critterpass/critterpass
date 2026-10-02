/**
 * The trip's best day (the day a year-later memory looks back on, 3m-10): the day with the most
 * moments the contributors counted (photos, detected visits, finds, early starts), not the first
 * day. Ties go to the earlier day; a trip with no counted moments has no best day.
 */
import type { RecapBestDay } from './schema';

/** Moments per trip day, keyed by `YYYY-MM-DD` on the trip's clock. */
export type RecapDayScores = ReadonlyMap<string, number>;

export function recapBestDay(
  scores: RecapDayScores,
  start: string,
  end: string,
): RecapBestDay | null {
  let best: RecapBestDay | null = null;
  for (const [localDate, score] of [...scores.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (localDate < start || localDate > end || score <= 0) continue;
    if (best !== null && score <= best.score) continue;
    const dayNo = Math.round((Date.parse(localDate) - Date.parse(start)) / 86_400_000) + 1;
    best = { day_no: dayNo, local_date: localDate, score };
  }
  return best;
}

/** Adds `other` into `into`, day by day. */
export function addRecapDayScores(into: Map<string, number>, other: RecapDayScores): void {
  for (const [day, score] of other) into.set(day, (into.get(day) ?? 0) + score);
}
