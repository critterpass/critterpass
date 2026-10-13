import type { MustDoMissReason } from '@cp/domain';
import type { ReviewModel, ReviewDay, SetupChange } from '../data/version';
import { upper } from '@cp/i18n';
import { clock, shortDate, weekday } from '../data/format';
import { t } from '@lingui/core/macro';

export function why(reason: MustDoMissReason): string {
  switch (reason) {
    case 'closed':
      return t({ id: 'planDraft.miss.closed', message: 'closed on your dates' });
    case 'no_time':
      return t({ id: 'planDraft.miss.noTime', message: 'no room in the days' });
    case 'unknown_place':
      return t({ id: 'planDraft.miss.unknown', message: 'I couldn’t find the place' });
    case 'dropped':
      return t({ id: 'planDraft.miss.dropped', message: 'it broke the day around it' });
  }
}

export type MissedMustDo = ReviewModel['mustDos']['missing'][number];

/* eslint-disable lingui/no-unlocalized-strings -- action keys, never copy. */
/** What the organiser can do about a must-do that did not make it; null when nothing helps. */
export function missAction(reason: MustDoMissReason): 'pick_place' | 'change_day' | null {
  switch (reason) {
    case 'unknown_place':
      return 'pick_place';
    case 'no_time':
    case 'dropped':
      return 'change_day';
    case 'closed':
      return null;
  }
}

export const ROW_BASE_DELAY_MS = 520;

/** "FRI · Nishiki Market at 11:20, Gion" and its variants, in the viewer's language. */
export function dayDetail(locale: string, day: ReviewDay): string {
  const wd = upper(weekday(locale, day.date), locale);
  if (day.lottery !== null) {
    const date = shortDate(locale, day.lottery.date);
    const first = day.stops[0]?.name ?? '';
    return t({ id: 'planDraft.day.lottery', message: `${wd} · ${first}, lottery result ${date}` });
  }
  const [first, ...rest] = day.stops;
  if (first === undefined) {
    return t({ id: 'planDraft.day.free', message: `${wd} · Nothing booked, on purpose` });
  }
  const name = first.name;
  const at = clock(locale, first.startsAt, first.tz);
  if (rest.length === 0) {
    return t({ id: 'planDraft.day.one', message: `${wd} · ${name} at ${at}` });
  }
  // Every stop of the day, so the list reads as the plan it asks her to approve.
  const next = rest.map((stop) => stop.name).join(', ');
  return t({ id: 'planDraft.day.two', message: `${wd} · ${name} at ${at}, ${next}` });
}

export interface DraftDayRowProps {
  readonly day: ReviewDay;
  readonly index: number;
  readonly locale: string;
  readonly colour: string;
  readonly onPress?: (() => void) | undefined;
}

export function changeWord(change: SetupChange): string {
  switch (change) {
    case 'dates':
      return t({ id: 'planDraft.stale.dates', message: 'the dates' });
    case 'must_dos':
      return t({ id: 'planDraft.stale.mustDos', message: 'the must-dos' });
    case 'budget':
      return t({ id: 'planDraft.stale.budget', message: 'the budget' });
    case 'rooms':
      return t({ id: 'planDraft.stale.rooms', message: 'the rooms' });
  }
}

export interface StaleBannerProps {
  readonly changes: readonly SetupChange[];
  readonly locale: string;
  readonly free: boolean;
  readonly onRedraft: () => void;
}
