/** The places map's and list's words built from facts: chips, the label, card lines, counts. */
import { plural, t } from '@lingui/core/macro';

import { categoryLabel } from '../category';
import type { CategoryGroup, HubPlace } from './places-model';

/** "45 min", "2h", "2h20": an hour or more reads in hours, as on the trip map. */
export function lengthLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return t({ id: 'places.length.minutes', message: `${whole} min` });
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (rest === 0) return t({ id: 'places.length.hours', message: `${hours}h` });
  const mm = String(rest).padStart(2, '0');
  return t({ id: 'places.length.hoursMinutes', message: `${hours}h${mm}` });
}

/** A day's short weekday from the app's own words ("Sat"; "T7" in Vietnamese), 0 = Sunday. */
export function weekdayShort(day: number): string {
  switch (((day % 7) + 7) % 7) {
    case 0:
      return t({ id: 'places.weekday.sun', message: 'Sun' });
    case 1:
      return t({ id: 'places.weekday.mon', message: 'Mon' });
    case 2:
      return t({ id: 'places.weekday.tue', message: 'Tue' });
    case 3:
      return t({ id: 'places.weekday.wed', message: 'Wed' });
    case 4:
      return t({ id: 'places.weekday.thu', message: 'Thu' });
    case 5:
      return t({ id: 'places.weekday.fri', message: 'Fri' });
    default:
      return t({ id: 'places.weekday.sat', message: 'Sat' });
  }
}

export function groupLabel(group: CategoryGroup): string {
  switch (group) {
    case 'food':
      return t({ id: 'places.group.food', message: 'Food' });
    case 'temples':
      return t({ id: 'places.group.temples', message: 'Temples' });
    case 'nature':
      return t({ id: 'places.group.nature', message: 'Nature' });
    case 'beaches':
      return t({ id: 'places.group.beaches', message: 'Beaches' });
    case 'museums':
      return t({ id: 'places.group.museums', message: 'Museums' });
    case 'nightlife':
      return t({ id: 'places.group.nightlife', message: 'Nightlife' });
    case 'shopping':
      return t({ id: 'places.group.shopping', message: 'Shopping' });
    case 'wellness':
      return t({ id: 'places.group.wellness', message: 'Wellness' });
  }
}

/** "Alex + Rin", "Alex, Rin + 2". */
export function namesLine(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return '';
  if (second === undefined) return first;
  if (names.length === 2) return t({ id: 'places.names.two', message: `${first} + ${second}` });
  const more = names.length - 2;
  return t({ id: 'places.names.more', message: `${first}, ${second} + ${more}` });
}

/** The label's second line: who saved it, which day it is on, or Tokek's pick. */
export function labelSubtitle(
  place: HubPlace,
  saverNames: readonly string[],
  guide: string,
): string {
  if (place.standing === 'plan' && place.dayNo !== null) {
    const day = place.dayNo;
    return t({ id: 'places.label.inPlan', message: `In the plan · day ${day}` });
  }
  if (place.standing === 'saved') {
    const who = namesLine(saverNames);
    return who === ''
      ? t({ id: 'places.label.saved', message: 'Saved' })
      : t({ id: 'places.label.savedBy', message: `Saved by ${who}` });
  }
  return t({ id: 'places.label.suggested', message: `${guide} suggests it` });
}

/** "Water temple · 45 min from the villa"; the category alone without a stay. */
export function cardDescription(
  category: string,
  minutesFromStay: number | null,
  stayName: string | null,
): string {
  const kind = categoryLabel(category);
  if (minutesFromStay === null || stayName === null) return kind;
  const length = lengthLabel(minutesFromStay);
  return t({ id: 'places.card.fromStay', message: `${kind} · ${length} from ${stayName}` });
}

/** "Tombs cut into a ravine · 10 min on" for the cards after the first. */
export function cardDescriptionOn(category: string, minutesOn: number): string {
  const kind = categoryLabel(category);
  const length = lengthLabel(minutesOn);
  return t({ id: 'places.card.minutesOn', message: `${kind} · ${length} on` });
}

/** The + button's words for a screen reader. */
export function addLabel(name: string): string {
  return t({ id: 'places.add', message: `Add ${name} to the plan` });
}

export function nextDoorLabel(): string {
  return t({ id: 'places.card.nextDoor', message: 'Next door' });
}

/** "1 of 9 in view · nearest first". */
export function carouselCount(position: number, count: number): string {
  return t({
    id: 'places.carousel.count',
    message: `${position} of ${count} in view · nearest first`,
  });
}

/** "86 places in view". */
export function inViewCount(count: number): string {
  return t({
    id: 'places.inView',
    message: plural(count, { one: '# place in view', other: '# places in view' }),
  });
}

/** "Saved, not in a day · 8". */
export function savedGroupTitle(count: number): string {
  return t({ id: 'places.group.saved', message: `Saved, not in a day · ${count}` });
}

/** "In the plan · 22". */
export function planGroupTitle(count: number): string {
  return t({ id: 'places.group.plan', message: `In the plan · ${count}` });
}

/** "Tokek suggests · 64". */
export function suggestsGroupTitle(guide: string, count: number): string {
  return t({ id: 'places.group.suggests', message: `${guide} suggests · ${count}` });
}

/** "Jatiluwih, Biah Biah, Karsa Spa and 19 more". */
export function planSummary(names: readonly string[]): string {
  const shown = names.slice(0, 3);
  const more = names.length - shown.length;
  const list = shown.join(', ');
  return more > 0
    ? t({ id: 'places.plan.summaryMore', message: `${list} and ${more} more` })
    : list;
}

/** "Light beams 09–10 · fits Sat": the editors' best time with the day it fits. */
export function bestTimeLine(bestTime: string, weekday: string | null): string {
  if (weekday === null) return bestTime;
  return t({ id: 'places.row.bestTime', message: `${bestTime} · fits ${weekday}` });
}

/** "850 m", "2.4 km", "12 km". */
export function distanceLabel(metres: number): string {
  if (metres < 1000) {
    const m = Math.max(10, Math.round(metres / 10) * 10);
    return t({ id: 'places.distance.m', message: `${m} m` });
  }
  const km =
    metres < 10_000
      ? (Math.round(metres / 100) / 10).toFixed(1)
      : String(Math.round(metres / 1000));
  return t({ id: 'places.distance.km', message: `${km} km` });
}

/**
 * A row's second line: "Temple · Ubud · 45 min" (from the stay) or "· 2.4 km" when the list runs
 * nearest first; the parts that are not known are left out.
 */
export function rowMeta(
  category: string,
  minutesFromStay: number | null,
  area: string | null = null,
  metres: number | null = null,
): string {
  const tail =
    metres !== null
      ? distanceLabel(metres)
      : minutesFromStay === null
        ? null
        : lengthLabel(minutesFromStay);
  return [categoryLabel(category), area, tail].filter((part) => part !== null).join(' · ');
}

/** The sort line, naming the order the list is really in. */
export function sortLabel(
  order: 'fit' | 'picks' | 'nearest' | 'az',
  facts: { readonly guide: string; readonly stay: string | null; readonly destination: string },
): string {
  const { guide, destination } = facts;
  const stay = facts.stay;
  switch (order) {
    case 'fit':
      return t({ id: 'places.sort.fit', message: 'Sorted by fit for your days' });
    case 'picks':
      return t({ id: 'places.sort.picks', message: `${guide}'s picks first` });
    case 'nearest':
      return stay === null
        ? t({ id: 'places.sort.nearestMiddle', message: `Nearest to the middle of ${destination}` })
        : t({ id: 'places.sort.nearestStay', message: `Nearest to ${stay}` });
    case 'az':
      return t({ id: 'places.sort.az', message: 'Sorted A–Z' });
  }
}

/** "Mon 19 · Day 1 · 4"; the day number alone before the trip has dates. */
export function planDayTitle(
  dayNo: number,
  date: string | null,
  weekday: string | null,
  count: number,
): string {
  const dayOfMonth = date === null ? null : String(Number(date.slice(8, 10)));
  return weekday === null || dayOfMonth === null
    ? t({ id: 'places.plan.day', message: `Day ${dayNo} · ${count}` })
    : t({
        id: 'places.plan.dayDated',
        message: `${weekday} ${dayOfMonth} · Day ${dayNo} · ${count}`,
      });
}

/** "In the plan · Tue" on a row, a card or a toast; the day number before the trip has dates. */
export function inPlanLine(dayNo: number | null, weekday: string | null): string {
  if (weekday !== null) return t({ id: 'places.row.inPlan', message: `In the plan · ${weekday}` });
  if (dayNo === null) return t({ id: 'places.row.inPlanNoDay', message: 'In the plan' });
  const day = dayNo;
  return t({ id: 'places.label.inPlan', message: `In the plan · day ${day}` });
}

/** A name short enough for one toast line, cut in the name and never in the sentence. */
export function shortName(name: string, max = 24): string {
  return name.length <= max ? name : `${name.slice(0, max - 1).trimEnd()}…`;
}

export function splitLabel(): string {
  return t({ id: 'places.row.split', message: 'Split' });
}

/** "Show Tirta Empul again", for a screen reader. */
export function showAgainLabel(name: string): string {
  return t({ id: 'places.hidden.showA11y', message: `Show ${name} again` });
}

/** The one-time line under the sort bar. */
export function swipeHint(): string {
  return t({ id: 'places.hint.swipe', message: 'Swipe a place right to save it' });
}
