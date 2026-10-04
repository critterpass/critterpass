/**
 * The lines the trip map's sheet reads: the plan check in the guide's words ("Three things to fix
 * before Oct 12.", "3 things to fix, 2 to know."), the countdown (the viewer's first departure,
 * else the trip's start), a day's chip and its one-line summary.
 */
import { plural, t } from '@lingui/core/macro';

import type { DayChip } from '@/ui/planning';

import { shortDate, weekday } from './format';
import type { TripDay } from './trip-days';

export interface CheckCounts {
  readonly fixes: number;
  readonly know: number;
  /** The check has run on the plan shown. */
  readonly done: boolean;
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

export function dayChips(days: readonly TripDay[], locale: string): DayChip[] {
  return days.map((day) => {
    const n = day.dayNo;
    const name = weekday(locale, day.date);
    return {
      dayNo: n,
      weekday: name,
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
