/**
 * How full a day is (7a-3, 7b-3 pace bars): the minutes its stops take, overlapping stops counted
 * once (a split afternoon is one afternoon), against the day's waking hours, in five steps. A day
 * with anything planned lights at least one bar; an empty day lights none.
 */
import { PACE_STEPS } from '@/ui/planning/pace-bars';

/** The day the crew plans in: 07:00 to 22:00, the same window the plan check reads. */
export const WAKING_FROM = 7 * 60;
export const WAKING_TO = 22 * 60;

export interface PacedStop {
  /** Local minutes after the day's midnight; untimed stops count as an hour. */
  readonly start: number | null;
  readonly end: number | null;
}

const UNTIMED_MINUTES = 60;

/** Minutes the day's stops cover inside its waking hours, overlaps merged. */
export function plannedMinutes(stops: readonly PacedStop[]): number {
  let untimed = 0;
  const spans: [number, number][] = [];
  for (const stop of stops) {
    if (stop.start === null || stop.end === null) {
      untimed += UNTIMED_MINUTES;
      continue;
    }
    const from = Math.max(WAKING_FROM, stop.start);
    const to = Math.min(WAKING_TO, stop.end);
    if (to > from) spans.push([from, to]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let reach = -1;
  for (const [from, to] of spans) {
    if (to <= reach) continue;
    total += to - Math.max(from, reach);
    reach = to;
  }
  return Math.min(WAKING_TO - WAKING_FROM, total + untimed);
}

/** Lit bars (0 to 5) for minutes planned in a day of `waking` minutes. */
export function paceLevel(planned: number, waking = WAKING_TO - WAKING_FROM): number {
  if (planned <= 0 || waking <= 0) return 0;
  return Math.max(1, Math.min(PACE_STEPS, Math.ceil((planned / waking) * PACE_STEPS)));
}

export function dayPace(stops: readonly PacedStop[]): number {
  return paceLevel(plannedMinutes(stops));
}
