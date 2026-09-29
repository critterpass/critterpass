/**
 * Date windows for trip setup (3c-3): a deterministic sliding window over every setup member's
 * date-level days. Only dates someone reported are candidates (a window never rests on nobody's
 * data); inside them a member can make a window unless one of its dates is `busy` or `maybe` for
 * them, and a member who has not synced is not a blocker ("as far as we know"). Windows rank by
 * how many can make it, then the destination's season score, then the crew's fare, then the
 * earliest start. Pure: the caller supplies days, season and fares.
 */

export type WindowDayState = 'free' | 'maybe' | 'busy';

export interface WindowMember {
  readonly uid: string;
  /** Reported days (`YYYY-MM-DD` → state); a missing date is unknown. */
  readonly days: ReadonlyMap<string, WindowDayState>;
  /** `maybe` days the member lets the guide ask about privately. */
  readonly askable?: ReadonlySet<string>;
}

export interface WindowInput {
  readonly members: readonly WindowMember[];
  readonly lengthDays: number;
  /** First date a window may start on (usually today, in the trip's zone). */
  readonly from: string;
  /** Last date a window may end on, at most six months after `from`. */
  readonly horizonDays?: number;
  /** Season score of one date for the destination, 0–100 (peaks, weather, crowds). */
  readonly seasonScore?: (date: string) => number;
  /** The crew's total fare for a window, minor units; `null` when unknown. */
  readonly fare?: (start: string, end: string) => bigint | null;
}

export interface ScoredWindow {
  readonly start: string;
  readonly end: string;
  readonly freeCount: number;
  readonly memberCount: number;
  /** Members who cannot make it, in member order. */
  readonly missing: readonly string[];
  /** Per missing member: their blocking dates in the window. */
  readonly blocking: ReadonlyMap<string, readonly string[]>;
  readonly seasonScore: number;
  readonly fare: bigint | null;
}

export const MAX_HORIZON_DAYS = 183;
const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function datesOf(start: string, lengthDays: number): string[] {
  return Array.from({ length: lengthDays }, (_, i) => addDays(start, i));
}

function reportedDates(input: WindowInput): Set<string> {
  const dates = new Set<string>();
  for (const member of input.members) for (const date of member.days.keys()) dates.add(date);
  return dates;
}

/** Every window of `lengthDays` inside the horizon, scored; empty when nobody reported a day. */
export function scoreWindows(input: WindowInput): ScoredWindow[] {
  const length = Math.max(1, Math.floor(input.lengthDays));
  const horizon = Math.min(input.horizonDays ?? MAX_HORIZON_DAYS, MAX_HORIZON_DAYS);
  const covered = reportedDates(input);
  if (covered.size === 0 || length > horizon + 1) return [];
  const windows: ScoredWindow[] = [];
  for (let offset = 0; offset + length - 1 <= horizon; offset += 1) {
    const dates = datesOf(addDays(input.from, offset), length);
    if (!dates.every((date) => covered.has(date))) continue;
    const blocking = new Map<string, string[]>();
    for (const member of input.members) {
      const blocked = dates.filter((date) => {
        const state = member.days.get(date);
        return state === 'busy' || state === 'maybe';
      });
      if (blocked.length > 0) blocking.set(member.uid, blocked);
    }
    const season = input.seasonScore;
    const start = dates[0] ?? input.from;
    const end = dates[dates.length - 1] ?? start;
    windows.push({
      start,
      end,
      freeCount: input.members.length - blocking.size,
      memberCount: input.members.length,
      missing: [...blocking.keys()],
      blocking,
      seasonScore: season
        ? Math.round(dates.reduce((sum, date) => sum + season(date), 0) / dates.length)
        : 0,
      fare: input.fare?.(start, end) ?? null,
    });
  }
  return windows.sort(compareWindows);
}

/** More can make it → better season → cheaper fare (unknown last) → earlier start. */
export function compareWindows(a: ScoredWindow, b: ScoredWindow): number {
  if (a.freeCount !== b.freeCount) return b.freeCount - a.freeCount;
  if (a.seasonScore !== b.seasonScore) return b.seasonScore - a.seasonScore;
  if (a.fare !== b.fare) {
    if (a.fare === null) return 1;
    if (b.fare === null) return -1;
    return a.fare < b.fare ? -1 : 1;
  }
  return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
}

/** The single best window, or `null` without data. */
export function bestWindow(input: WindowInput): ScoredWindow | null {
  return scoreWindows(input)[0] ?? null;
}
