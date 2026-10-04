/**
 * The words and numbers the trip map, the day plan and all days share: lengths ("3h30",
 * "20 min"), legs ("CAR · 1H10", "about" for an estimate), a day's date line, its tag and the
 * guide's note for a plan check issue, all in the reader's language.
 */
import { plural, t } from '@lingui/core/macro';
import { tokens } from '@cp/design-tokens';
import type { PlanCheckIssue } from '@cp/domain';
import { format } from '@cp/i18n';

import type { DayLeg } from '@/data/legs/day-legs';

import type { DayTag } from './trip-days';

/** "3h30", "1h", "20 min". */
export function lengthLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return t({ id: 'plan.tripMap.minutes', message: `${whole} min` });
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (rest === 0) return t({ id: 'plan.tripMap.hours', message: `${hours}h` });
  const mm = String(rest).padStart(2, '0');
  return t({ id: 'plan.tripMap.hoursMinutes', message: `${hours}h${mm}` });
}

export function modeLabel(mode: DayLeg['mode']): string {
  switch (mode) {
    case 'walk':
      return t({ id: 'plan.tripMap.leg.walk', message: 'Walk' });
    case 'ride':
      return t({ id: 'plan.tripMap.leg.ride', message: 'Ride' });
    case 'driver':
      return t({ id: 'plan.tripMap.leg.driver', message: 'Driver' });
    case 'drive':
      return t({ id: 'plan.tripMap.leg.car', message: 'Car' });
  }
}

/** "Car · 1h10", or "Car · about 1h10" while the leg is a straight-line estimate. */
export function legLabel(leg: DayLeg): string {
  const mode = modeLabel(leg.mode);
  const length = lengthLabel(leg.minutes);
  return leg.approx && leg.source === 'straight_line'
    ? t({ id: 'plan.tripMap.leg.about', message: `${mode} · about ${length}` })
    : t({ id: 'plan.tripMap.leg', message: `${mode} · ${length}` });
}

/** Minutes on the road (driving, a ride or the driver), and whether any of it is an estimate. */
export function roadMinutes(legs: readonly DayLeg[]): { minutes: number; approx: boolean } {
  const road = legs.filter((leg) => leg.mode !== 'walk');
  return {
    minutes: road.reduce((sum, leg) => sum + leg.minutes, 0),
    approx: road.some((leg) => leg.source === 'straight_line'),
  };
}

/** "5 stops · 2h40 in the car". */
export function stopsLine(stops: number, legs: readonly DayLeg[]): string {
  const road = roadMinutes(legs);
  const count = t({
    id: 'plan.tripMap.stops',
    message: plural(stops, { one: '# stop', other: '# stops' }),
  });
  if (road.minutes === 0) return count;
  const length = lengthLabel(road.minutes);
  return road.approx
    ? t({ id: 'plan.tripMap.inTheCarAbout', message: `${count} · about ${length} in the car` })
    : t({ id: 'plan.tripMap.inTheCar', message: `${count} · ${length} in the car` });
}

function localDate(date: string): Date {
  const [year = 2000, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Wed Oct 14". */
export function dateLine(locale: string, date: string): string {
  return format.date(locale, localDate(date), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "Oct 12". */
export function shortDate(locale: string, date: string): string {
  return format.date(locale, localDate(date), { month: 'short', day: 'numeric' });
}

/** "Wed". */
export function weekday(locale: string, date: string | null): string {
  return date === null ? '' : format.date(locale, localDate(date), { weekday: 'short' });
}

/** "Oct 12–19" for the trip's dates. */
export function tripDates(locale: string, start: string | null, end: string | null): string {
  if (start === null) return '';
  if (end === null || end === start) return shortDate(locale, start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const last = sameMonth ? String(Number(end.slice(8, 10))) : shortDate(locale, end);
  return `${shortDate(locale, start)}–${last}`;
}

export function tagLabel(tag: DayTag, short = false): string {
  switch (tag.kind) {
    case 'clash':
      return t({ id: 'plan.tripMap.tag.clash', message: 'Clash' });
    case 'too_far':
      return short
        ? t({ id: 'plan.tripMap.tag.far', message: 'Far' })
        : t({ id: 'plan.tripMap.tag.tooFar', message: 'Too far' });
    case 'rain':
      return t({ id: 'plan.tripMap.tag.rain', message: 'Rain' });
    case 'closed':
      return t({ id: 'plan.tripMap.tag.closed', message: 'Closed' });
    case 'vote':
      return t({ id: 'plan.tripMap.tag.vote', message: 'Vote' });
    case 'booked':
      return t({ id: 'plan.tripMap.tag.booked', message: 'Booked' });
  }
}

/** The tag's fill; a vote waits quietly on the row. */
export function tagColor(tag: DayTag): string | undefined {
  switch (tag.kind) {
    case 'clash':
    case 'closed':
      return tokens.color.pink;
    case 'too_far':
      return tokens.color.orange;
    case 'rain':
      return tokens.color.blue;
    case 'booked':
      return tokens.color.green.base;
    case 'vote':
      return undefined;
  }
}

/** The guide's note for an issue, under the stop it names (7b-1 "Rain at 1, right on the ridge."). */
export function issueLine(issue: PlanCheckIssue, nameOf: (stableId: string) => string): string {
  switch (issue.kind) {
    case 'rain': {
      const { from, to } = issue.params;
      const stop = nameOf(issue.params.stable_id);
      return t({
        id: 'plan.tripMap.issue.rain',
        message: `Rain from ${from} to ${to}, right on ${stop}.`,
      });
    }
    case 'clash': {
      const first = nameOf(issue.params.first);
      const second = nameOf(issue.params.second);
      const short = issue.params.short_minutes;
      return t({
        id: 'plan.tripMap.issue.clash',
        message: `${first} runs into ${second} by ${short} min.`,
      });
    }
    case 'closed': {
      const stop = nameOf(issue.params.stable_id);
      return t({ id: 'plan.tripMap.issue.closed', message: `${stop} is closed then.` });
    }
    case 'too_far': {
      const drive = lengthLabel(issue.params.drive_minutes);
      return t({ id: 'plan.tripMap.issue.tooFar', message: `${drive} of driving this day.` });
    }
    case 'crowds': {
      const stop = nameOf(issue.params.stable_id);
      const from = issue.params.busy_from;
      return t({ id: 'plan.tripMap.issue.crowds', message: `${stop} gets busy from ${from}.` });
    }
    case 'pace': {
      const stops = issue.params.stops;
      return t({ id: 'plan.tripMap.issue.pace', message: `${stops} stops is a lot for one day.` });
    }
    case 'booking_note':
      return t({ id: 'plan.tripMap.issue.booking', message: 'A booking needs a look soon.' });
  }
}
