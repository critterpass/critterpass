/**
 * Local minutes of a day: the 15-minute grid plan items sit on, and a place's opening spans on a
 * date (a span that runs past midnight ends after minute 1440).
 */
import { WEEKDAYS, type Hours } from '@cp/domain';

export const GRID_MIN = 15;

export const ceilGrid = (minute: number): number => Math.ceil(minute / GRID_MIN) * GRID_MIN;
export const floorGrid = (minute: number): number => Math.floor(minute / GRID_MIN) * GRID_MIN;

export interface Span {
  readonly start: number;
  readonly end: number;
}

const toMin = (time: string) => {
  if (time === '24:00') return 1440;
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Opening spans of `hours` on `date` in local minutes; null hours = open all day. */
export function spansOn(hours: Hours | null, date: string): readonly Span[] {
  if (hours === null) return [{ start: 0, end: 2880 }];
  const exception = hours.exceptions?.find((entry) => entry.date === date);
  const isoDow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const spans = exception?.spans ?? hours.weekly[WEEKDAYS[isoDow] ?? 'mo'] ?? [];
  return spans.map((s) => {
    const start = toMin(s.start);
    const end = toMin(s.end);
    return { start, end: end <= start ? end + 1440 : end };
  });
}
