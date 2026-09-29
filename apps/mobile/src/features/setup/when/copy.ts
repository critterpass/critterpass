/**
 * The dates step's words: window ranges ("Apr 2–9"), counts as words where the design spells
 * them ("five of six"), the guide's reason lines from the option's reason key (templates, never a
 * model), and the option cards' titles and lines. Only first names and must-do titles are named;
 * nobody's calendar is described.
 */
import { plural, t } from '@lingui/core/macro';

import { format } from '@cp/i18n';

import { dateValue, type WindowOption } from './model';

const UTC = 'UTC';

/** "Apr 2 – 9" (locale range formatting). */
export function rangeLabel(locale: string, start: string, end: string): string {
  return format.dateInterval(locale, dateValue(start), dateValue(end), {
    month: 'short',
    day: 'numeric',
    timeZone: UTC,
  });
}

/** "April 2027". */
export function monthLabel(locale: string, year: number, month: number): string {
  return format.date(locale, new Date(Date.UTC(year, month - 1, 15)), {
    month: 'long',
    year: 'numeric',
    timeZone: UTC,
  });
}

/** "June". */
export function monthName(locale: string, date: string): string {
  return format.date(locale, dateValue(date), { month: 'long', timeZone: UTC });
}

/** Narrow weekday letters, Monday first. */
export function weekdayLetters(locale: string): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, index) =>
    format.date(locale, new Date(Date.UTC(2024, 0, 1 + index, 12)), {
      weekday: 'narrow',
      timeZone: UTC,
    }),
  );
}

/** A count as the design spells it ("six"); digits past twelve. */
export function countWord(n: number): string {
  return t({
    id: 'setup.when.countWord',
    message: plural(n, {
      0: 'none',
      1: 'one',
      2: 'two',
      3: 'three',
      4: 'four',
      5: 'five',
      6: 'six',
      7: 'seven',
      8: 'eight',
      9: 'nine',
      10: 'ten',
      11: 'eleven',
      12: 'twelve',
      other: '#',
    }),
  });
}

/** Capitalises a word that opens a sentence ("six" → "Six"); scripts without case are unchanged. */
export function sentenceStart(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}

export function namesList(locale: string, names: readonly string[]): string {
  return format.list(locale, names, { type: 'conjunction' });
}

/** The guide's line under a best window, from its reason key. */
export function bestReasonLine(option: WindowOption, place: string): string {
  switch (option.reason) {
    case 'season_peak':
      return t({
        id: 'setup.when.reason.seasonPeak',
        message: `This week sits in ${place}'s best season, and everyone's free. It gets you both.`,
      });
    case 'fare_drop':
      return t({
        id: 'setup.when.reason.fareDrop',
        message: 'Everyone’s free, and flights are cheaper that week.',
      });
    default:
      return t({
        id: 'setup.when.reason.fullCrew',
        message: 'The first week the whole crew is free. Lock it before calendars fill up.',
      });
  }
}

/** The guide's line under the no-fit options, about its pick. */
export function pickReasonLine(pick: WindowOption | undefined): string {
  if (pick?.kind === 'ask_first') {
    return t({
      id: 'setup.when.pick.askFirst',
      message: '“Maybe” usually means it can move. Worth one message.',
    });
  }
  if (pick?.kind === 'full_crew') {
    return t({
      id: 'setup.when.pick.fullCrew',
      message: 'Everyone together beats the perfect week. That’s my pick.',
    });
  }
  return t({
    id: 'setup.when.pick.partial',
    message: 'Most of you, at the best time. The rest can join for part of it.',
  });
}
