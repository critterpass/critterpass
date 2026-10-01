/**
 * When in the day a must-do should happen. Crew members write it into a must-do ("Marble
 * Mountains at sunrise", "chợ đêm"), and the guide knows it of some places (a show that only runs
 * at night). The planner holds such a stop inside its time of day: it may start before the day's
 * usual start (a sunrise) or run past its usual end (a night show), and a full-day place gets the
 * block a full day needs. A place's own opening hours still win: one that opens at seven is not
 * visited at five.
 */
import { nameTokens } from './place-names';
import type { DraftPoi } from './types';

export const WISH_TIMES = [
  'any',
  'sunrise',
  'morning',
  'afternoon',
  'evening',
  'night',
  'full_day',
] as const;
export type WishTime = (typeof WISH_TIMES)[number];

/** The local minutes a timed stop may start between. */
export const WISH_TIME_STARTS: Readonly<
  Record<Exclude<WishTime, 'any'>, { readonly fromMin: number; readonly toMin: number }>
> = {
  sunrise: { fromMin: 5 * 60, toMin: 6 * 60 + 30 },
  morning: { fromMin: 8 * 60, toMin: 10 * 60 + 30 },
  afternoon: { fromMin: 13 * 60, toMin: 16 * 60 },
  evening: { fromMin: 17 * 60, toMin: 19 * 60 + 30 },
  night: { fromMin: 21 * 60, toMin: 21 * 60 + 45 },
  full_day: { fromMin: 8 * 60, toMin: 9 * 60 + 30 },
};

/** A full-day place takes at least this long (morning to mid-afternoon). */
export const FULL_DAY_MIN = 6 * 60;

/** Word runs that name a time of day, in English and Vietnamese (accents folded). */
const WORDS: readonly (readonly [Exclude<WishTime, 'any'>, readonly string[]])[] = [
  ['sunrise', ['sunrise', 'dawn', 'first light', 'binh minh', 'sang som', 'mat troi moc']],
  ['night', ['night', 'midnight', 'late', 'dem', 'khuya']],
  ['evening', ['evening', 'sunset', 'dusk', 'toi', 'hoang hon', 'mat troi lan']],
  ['afternoon', ['afternoon', 'chieu']],
  ['morning', ['morning', 'breakfast', 'sang']],
  ['full_day', ['all day', 'full day', 'day trip', 'ca ngay']],
];

function contains(tokens: readonly string[], phrase: readonly string[]): boolean {
  for (let at = 0; at + phrase.length <= tokens.length; at += 1) {
    if (phrase.every((word, i) => tokens[at + i] === word)) return true;
  }
  return false;
}

/** The time of day a must-do's own words name, or null when they name none. */
export function timeWords(text: string): Exclude<WishTime, 'any'> | null {
  const tokens = nameTokens(text);
  for (const [time, phrases] of WORDS) {
    if (phrases.some((phrase) => contains(tokens, phrase.split(' ')))) return time;
  }
  return null;
}

/** The start window of a timed stop, or null for an untimed one. */
export function timeWindow(when: WishTime | null | undefined) {
  return when === null || when === undefined || when === 'any' ? null : WISH_TIME_STARTS[when];
}

/** How long a stop lasts at its time of day: a full-day place gets a full day. */
export function timedDuration(poi: DraftPoi, when: WishTime | null | undefined): number {
  return when === 'full_day' ? Math.max(poi.durationMin, FULL_DAY_MIN) : poi.durationMin;
}

const WEEKDAY_WORDS: readonly (readonly [string, readonly string[]])[] = [
  ['monday', ['mo']],
  ['tuesday', ['tu']],
  ['wednesday', ['we']],
  ['thursday', ['th']],
  ['friday', ['fr']],
  ['saturday', ['sa']],
  ['sunday', ['su']],
  ['weekend', ['sa', 'su']],
  ['weekday', ['mo', 'tu', 'we', 'th', 'fr']],
  ['thu bay', ['sa']],
  ['chu nhat', ['su']],
  ['cuoi tuan', ['sa', 'su']],
];

/**
 * The weekdays a line of our editors' text names ("Saturday or Sunday evening", "weekend nights"),
 * in the order of the week; empty when it names none.
 */
export function namedWeekdays(text: string | null | undefined): string[] {
  if (text === null || text === undefined) return [];
  const tokens = nameTokens(text);
  const found = new Set<string>();
  for (const [phrase, days] of WEEKDAY_WORDS) {
    if (contains(tokens, phrase.split(' '))) for (const day of days) found.add(day);
  }
  return ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].filter((day) => found.has(day));
}
