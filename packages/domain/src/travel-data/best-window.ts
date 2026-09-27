/**
 * `bestWindow`: the quietest stretch of a place's day ("GO BEFORE 7:30"), computed from a 24-value
 * hourly crowd curve (0–100, index = local hour) and the place's open spans for that day. The
 * window is the contiguous run of whole open hours with the lowest mean crowd level; ties go to
 * the earlier window. Deterministic, so the same forecast always yields the same advice.
 */
import type { TimeSpan } from '../places/hours';

export interface BestWindow {
  /** Local `HH:MM`. */
  readonly start: string;
  /** Local `HH:MM` (`24:00` = midnight at the end of the day). */
  readonly end: string;
  /** Mean crowd level (0–100) over the window, rounded. */
  readonly level: number;
}

export const DEFAULT_WINDOW_HOURS = 2;

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number) as [number, number];
  return hours * 60 + mins;
}

function hhmm(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/** Hours (0–23) whose whole hour lies inside one of `spans`; spans past midnight wrap. */
export function openHours(spans: readonly TimeSpan[]): boolean[] {
  const open = Array.from({ length: 24 }, () => false);
  for (const span of spans) {
    const start = minutes(span.start);
    const end = span.end === '24:00' ? 1440 : minutes(span.end);
    const ranges: [number, number][] =
      end > start
        ? [[start, end]]
        : [
            [start, 1440],
            [0, end],
          ];
    for (const [from, to] of ranges) {
      for (let hour = 0; hour < 24; hour += 1) {
        if (hour * 60 >= from && (hour + 1) * 60 <= to) open[hour] = true;
      }
    }
  }
  return open;
}

/**
 * The quietest `windowHours`-long run of open hours, or `null` when the curve is not 24 values or
 * no run of that length is open (a place open for less than the window gets its single quietest
 * open hour instead).
 */
export function bestWindow(
  hourly: readonly number[],
  openSpans: readonly TimeSpan[],
  windowHours: number = DEFAULT_WINDOW_HOURS,
): BestWindow | null {
  if (hourly.length !== 24) return null;
  const open = openHours(openSpans);
  const pick = (length: number): BestWindow | null => {
    let best: { start: number; mean: number } | null = null;
    for (let start = 0; start + length <= 24; start += 1) {
      const hours = Array.from({ length }, (_, offset) => start + offset);
      if (!hours.every((hour) => open[hour] === true)) continue;
      const mean = hours.reduce((sum, hour) => sum + (hourly[hour] ?? 0), 0) / length;
      if (best === null || mean < best.mean) best = { start, mean };
    }
    return best === null
      ? null
      : { start: hhmm(best.start), end: hhmm(best.start + length), level: Math.round(best.mean) };
  };
  return pick(windowHours) ?? (windowHours > 1 ? pick(1) : null);
}
