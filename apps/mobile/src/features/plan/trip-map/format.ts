/**
 * The words and numbers the trip map, the day plan and all days share: lengths ("3h30",
 * "20 min"), legs ("CAR · 1H10", "about" for an estimate), a day's date line, its tag and the
 * guide's note for a plan check issue, all in the reader's language.
 */
import { plural, t } from '@lingui/core/macro';
import { tokens } from '@cp/design-tokens';
import { AREA_LINK_MODES, type PlanCheckIssue } from '@cp/domain';
import { currencyExponent, currencySymbol, isKnownCurrency } from '@cp/cost-engine';
import { format } from '@cp/i18n';

import type { DayLeg } from '@/data/legs/day-legs';
import { travelLegLabel } from '@/data/areas/travel-line';

import type { DayTag, TripDay } from './trip-days';

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
    case 'car':
      return t({ id: 'plan.tripMap.leg.car', message: 'Car' });
    case 'flight':
      return t({ id: 'plan.tripMap.leg.flight', message: 'Flight' });
    case 'train':
      return t({ id: 'plan.tripMap.leg.train', message: 'Train' });
    case 'bus':
      return t({ id: 'plan.tripMap.leg.bus', message: 'Bus' });
    case 'boat':
      return t({ id: 'plan.tripMap.leg.boat', message: 'Boat' });
    case 'tour':
      return t({ id: 'plan.tripMap.leg.tour', message: 'Tour' });
  }
}

/** "Car · 1h10", or "Car · about 1h10" while the leg is a straight-line estimate. */
export function legLabel(leg: DayLeg): string {
  // Its routed time is on its way: no figure that will change in a moment.
  if (leg.pending === true) {
    return t({ id: 'plan.tripMap.leg.pending', message: 'Working out the ride…' });
  }
  // Between two areas: the link's own mode word and "about", never a car time.
  const linkMode = AREA_LINK_MODES.find((mode) => mode === leg.mode);
  if (leg.source === 'link' && linkMode !== undefined) {
    return travelLegLabel({ minutes: leg.minutes, mode: linkMode });
  }
  const mode = modeLabel(leg.mode);
  const length = lengthLabel(leg.minutes);
  return leg.approx && leg.source === 'straight_line'
    ? t({ id: 'plan.tripMap.leg.about', message: `${mode} · about ${length}` })
    : t({ id: 'plan.tripMap.leg', message: `${mode} · ${length}` });
}

/** Minutes on the road (driving, a ride or the driver), and whether any of it is an estimate. */
export function roadMinutes(legs: readonly DayLeg[]): {
  minutes: number;
  approx: boolean;
  /** A leg's routed time is still on its way: the total is not to be shown yet. */
  pending: boolean;
} {
  // A day trip's way there and back is its own line, never time "in the car".
  const road = legs.filter((leg) => leg.mode !== 'walk' && leg.source !== 'link');
  return {
    minutes: road.reduce((sum, leg) => sum + leg.minutes, 0),
    approx: road.some((leg) => leg.source === 'straight_line'),
    pending: legs.some((leg) => leg.pending === true),
  };
}

/** "5 stops · 2h40 in the car". */
export function stopsLine(stops: number, legs: readonly DayLeg[]): string {
  const road = roadMinutes(legs);
  const count = t({
    id: 'plan.tripMap.stops',
    message: plural(stops, { one: '# stop', other: '# stops' }),
  });
  if (road.pending) {
    return t({ id: 'plan.tripMap.inTheCarPending', message: `${count} · working out the rides` });
  }
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

function isVietnamese(locale: string): boolean {
  return locale.toLowerCase().startsWith('vi');
}

/**
 * "Th 7", "CN": the short Vietnamese weekday, written here because phones disagree on it ("Th 7"
 * on one system, "Thứ 7" on the next) and a day must read the same on every screen.
 */
function vietnameseWeekday(at: Date): string {
  const day = at.getDay();
  return day === 0 ? 'CN' : `Th ${String(day + 1)}`;
}

/**
 * A day by its date, the one way every plan screen names it: "Tue 20 Oct" in English (the month
 * by name: "10/20" reads as the 10th of the 20th month to most of the world), "Th 3, 20/10" in
 * Vietnamese, and the locale's own short date with its weekday in any other language.
 */
export function dateLine(locale: string, date: string): string {
  const at = localDate(date);
  if (isVietnamese(locale)) {
    return `${vietnameseWeekday(at)}, ${String(at.getDate())}/${String(at.getMonth() + 1)}`;
  }
  if (locale.toLowerCase().startsWith('en')) {
    const name = format.date(locale, at, { weekday: 'short' });
    const month = format.date(locale, at, { month: 'short' });
    return `${name} ${String(at.getDate())} ${month}`;
  }
  return format.date(locale, at, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "17": the day of the month, for a chip's second line. */
export function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/**
 * The weekday as short as a chip needs: the locale's short form, with Vietnamese "Th 7" closed up
 * to "T7" (over a date, "Th 4" also reads as "tháng 4").
 */
export function chipWeekday(locale: string, date: string | null): string {
  if (date === null) return '';
  return isVietnamese(locale)
    ? vietnameseWeekday(localDate(date)).replace('Th ', 'T')
    : weekday(locale, date);
}

/** "Day 3 of 8": where a day sits in the trip, under its date. */
export function dayOfTrip(n: number, of: number): string {
  return t({ id: 'plan.tripMap.dayOf', message: `Day ${n} of ${of}` });
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

/** "Rp 60k", "$38", "€1.2k": an amount in minor units, short, with the currency's own symbol. */
export function compactMoney(locale: string, amountMinor: number, currency: string): string {
  // The stored amount's exponent (ISO: IDR has two) and the app's own symbol for the currency.
  const known = isKnownCurrency(currency);
  const digits = known ? currencyExponent(currency) : 2;
  const major = Math.abs(amountMinor) / 10 ** digits;
  const symbol = known ? currencySymbol(currency, 'narrow') : currency;
  const short = (value: number) =>
    format.number(locale, value, { maximumFractionDigits: value < 10 ? 1 : 0 });
  const amount =
    major >= 1e6
      ? t({ id: 'plan.tripMap.money.millions', message: `${short(major / 1e6)}M` })
      : major >= 1e3
        ? t({ id: 'plan.tripMap.money.thousands', message: `${short(major / 1e3)}k` })
        : short(major);
  // A letter symbol (Rp) takes a space; a sign ($, €) sits on the number.
  return /\p{L}$/u.test(symbol) ? `${symbol} ${amount}` : `${symbol}${amount}`;
}

/** A day's name with where it is spent: "Wed 14 · Machu Picchu"; the name alone in the city. */
export function withArea(name: string, day: Pick<TripDay, 'area'>): string {
  const area = day.area?.name ?? '';
  return area === '' ? name : `${name} · ${area}`;
}
