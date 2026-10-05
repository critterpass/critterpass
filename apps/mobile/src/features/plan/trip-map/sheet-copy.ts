/**
 * The lines the trip map's sheet reads: the plan check in the guide's words ("Three things to fix
 * before Oct 12.", "3 things to fix, 2 to know."), the countdown (the viewer's first departure,
 * else the trip's start), a day's chip and its one-line summary.
 */
import { plural, t } from '@lingui/core/macro';

import type { DayChip } from '@/ui/planning';

import { chipWeekday, dateLine, dayOfMonth, shortDate } from './format';
import type { TripDay } from './trip-days';

export interface CheckCounts {
  readonly fixes: number;
  readonly know: number;
  /** There is a count to show: the check has run on the plan shown, or on the one before it. */
  readonly done: boolean;
  /** The check is running on the plan shown (after an edit); the counts are the last ones. */
  readonly checking?: boolean | undefined;
}

/**
 * The counts the plan's screens show. Once the check has run on the version on screen they are
 * its own. While it is queued or running on a new version (an edit made one), the last counts
 * stay, marked as being checked again: a number that jumps and comes back a minute later reads as
 * something she broke. With no earlier count there is only "checking".
 */
export function checkCounts(
  view: {
    readonly check: { readonly status: string; readonly version_id: string | null } | null;
    readonly fixes: number;
    readonly know: number;
    /** The check hook's own word that a run is under way, where it gives one. */
    readonly checking?: boolean | undefined;
  },
  versionId: string | null,
  last: CheckCounts | undefined,
): CheckCounts {
  const { check } = view;
  const onThisVersion = check !== null && check.version_id === versionId;
  if (view.checking !== true && onThisVersion && check.status === 'done') {
    return { fixes: view.fixes, know: view.know, done: true };
  }
  const pending =
    view.checking === true ||
    (check !== null && (check.status === 'queued' || check.status === 'running' || !onThisVersion));
  if (!pending) return { fixes: 0, know: 0, done: false };
  return last === undefined
    ? { fixes: 0, know: 0, done: false, checking: true }
    : { fixes: last.fixes, know: last.know, done: true, checking: true };
}

/** "Checking again…" under the last count, or alone before there is one; null when not checking. */
export function checkingLine(check: CheckCounts): string | null {
  if (check.checking !== true) return null;
  return check.done
    ? t({ id: 'plan.tripMap.check.checkingAgain', message: 'Checking again after the change…' })
    : t({ id: 'plan.tripMap.check.checking', message: 'Checking the plan…' });
}

/** The peek sheet's note; null until the check has something to say. */
export function peekCheckLine(check: CheckCounts, locale: string, start: string | null) {
  if (!check.done) return null;
  if (check.fixes === 0) {
    const know = check.know;
    return know === 0
      ? t({ id: 'plan.tripMap.check.clear', message: 'Nothing to fix. The plan holds up.' })
      : t({
          id: 'plan.tripMap.check.knowOnly',
          message: plural(know, {
            one: 'Nothing to fix, # thing to know.',
            other: 'Nothing to fix, # things to know.',
          }),
        });
  }
  const fixes = check.fixes;
  if (start === null) {
    return t({
      id: 'plan.tripMap.check.fixes',
      message: plural(fixes, { one: 'One thing to fix.', other: '# things to fix.' }),
    });
  }
  const date = shortDate(locale, start);
  return t({
    id: 'plan.tripMap.check.fixesBefore',
    message: plural(fixes, {
      one: `One thing to fix before ${date}.`,
      other: `# things to fix before ${date}.`,
    }),
  });
}

/** The whole trip's check card: "3 things to fix, 2 to know." */
export function tripCheckLine(check: CheckCounts): string | null {
  if (!check.done) return null;
  const fixes = check.fixes;
  const know = check.know;
  if (fixes === 0 && know === 0) {
    return t({ id: 'plan.tripMap.check.clear', message: 'Nothing to fix. The plan holds up.' });
  }
  const fixPart = t({
    id: 'plan.tripMap.check.fixPart',
    message: plural(fixes, { one: '# thing to fix', other: '# things to fix' }),
  });
  if (know === 0) return t({ id: 'plan.tripMap.check.fixOnly', message: `${fixPart}.` });
  const knowPart = t({
    id: 'plan.tripMap.check.knowPart',
    message: plural(know, { one: '# to know', other: '# to know' }),
  });
  return t({ id: 'plan.tripMap.check.both', message: `${fixPart}, ${knowPart}.` });
}

const DAY_MS = 86_400_000;

/** "17 days to go" before the trip; null once it has begun. */
export function countdownLine(target: Date | null, now: Date = new Date()): string | null {
  if (target === null) return null;
  const days = Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return null;
  return t({
    id: 'plan.tripMap.countdown',
    message: plural(days, { one: 'Tomorrow', other: '# days to go' }),
  });
}

/**
 * The days as chips, named by date: the weekday over the day of the month ("T7" over "17"), with
 * today marked while the trip runs. A day with no date yet keeps its number.
 */
export function dayChips(
  days: readonly TripDay[],
  locale: string,
  today: string | null = null,
): DayChip[] {
  return days.map((day) => {
    const n = day.dayNo;
    const name = day.date === null ? '' : dateLine(locale, day.date);
    return {
      dayNo: n,
      weekday: chipWeekday(locale, day.date),
      ...(day.date === null ? {} : { dateLabel: dayOfMonth(day.date) }),
      ...(today !== null && day.date === today ? { today: true } : {}),
      color: day.color,
      accessibilityLabel: t({ id: 'plan.tripMap.dayChip', message: `Day ${n}, ${name}` }),
    };
  });
}

/** "Cooking class · Monkey Forest · market"; a booked stop carries its time. */
export function daySummary(day: TripDay, clockOf: (minutes: number) => string): string {
  if (day.stops.length === 0) {
    return t({ id: 'plan.tripMap.nothingYet', message: 'Nothing planned yet' });
  }
  return day.stops
    .map((stop) =>
      stop.bookingId !== null && stop.start !== null
        ? `${stop.title} ${clockOf(stop.start)}`
        : stop.title,
    )
    .join(' · ');
}

/** "4 of 5 full", for a screen reader on the pace bars. */
export function paceWords(day: TripDay): string {
  const level = day.pace;
  return t({ id: 'plan.tripMap.pace', message: `${level} of 5 full` });
}
