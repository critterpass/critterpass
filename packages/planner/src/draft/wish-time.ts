/**
 * When in the day a must-do should happen. Crew members write it into a must-do ("Marble
 * Mountains at sunrise", "chợ đêm"), and the guide knows it of some places (a show that only runs
 * at night). The planner holds such a stop inside its time of day: it may start before the day's
 * usual start (a sunrise) or run past its usual end (a night show), and a full-day place gets the
 * block a full day needs. A place's own opening hours still win: one that opens at seven is
 * visited at seven, not at five. Hours that are only the usual ones of its kind (open data) never
 * overrule the time.
 */
import { ceilGrid, floorGrid, spansOn } from './day-minutes';
import { nameTokens } from './place-names';
import { placeTimes, timeOfDayWindow } from './time-of-day';
import { isTyped } from './typed-facts';
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
type TimeOfDay = Exclude<WishTime, 'any'>;

export interface StartWindow {
  readonly fromMin: number;
  readonly toMin: number;
}

/** The local minutes a timed stop may start between. */
export const WISH_TIME_STARTS: Readonly<Record<TimeOfDay, StartWindow>> = {
  sunrise: { fromMin: 5 * 60, toMin: 6 * 60 + 30 },
  morning: { fromMin: 8 * 60, toMin: 10 * 60 + 30 },
  afternoon: { fromMin: 13 * 60, toMin: 16 * 60 },
  evening: { fromMin: 17 * 60, toMin: 19 * 60 + 30 },
  night: { fromMin: 21 * 60, toMin: 21 * 60 + 45 },
  full_day: { fromMin: 8 * 60, toMin: 9 * 60 + 30 },
};

/** A full-day place takes at least this long (morning to mid-afternoon). */
export const FULL_DAY_MIN = 6 * 60;

/**
 * Word runs that name a time of day, read in this order (a full day first, so "all day, back by
 * evening" is a full day). `plain` runs are matched with accents folded: English, and Vietnamese
 * phrases typed without tones ("cho dem"). `toned` runs are matched with their tone marks, because
 * the bare syllables are other words: "tối" is the evening, "tôi" is I and "tới" is to; "đêm" is
 * the night, "đem" is to bring. "sáng" alone is also a name (Ánh Sáng), so the morning is read
 * only from a phrase.
 */
const WORDS: readonly (readonly [TimeOfDay, readonly string[], readonly string[]])[] = [
  ['full_day', ['all day', 'full day', 'whole day', 'day trip', 'ca ngay', 'nguyen ngay'], []],
  ['sunrise', ['sunrise', 'dawn', 'first light', 'binh minh', 'sang som', 'mat troi moc'], []],
  ['night', ['night', 'midnight', 'ban dem', 'cho dem'], ['đêm', 'khuya']],
  [
    'evening',
    ['evening', 'sunset', 'dusk', 'hoang hon', 'mat troi lan', 'buoi toi', 'chieu toi'],
    ['tối'],
  ],
  ['afternoon', ['afternoon', 'buoi chieu'], ['chiều']],
  ['morning', ['morning', 'breakfast', 'buoi sang', 'an sang'], []],
];

/** Lowercase words with their tone marks kept. */
function tonedTokens(text: string): string[] {
  return text
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function contains(tokens: readonly string[], phrase: readonly string[]): boolean {
  for (let at = 0; at + phrase.length <= tokens.length; at += 1) {
    if (phrase.every((word, i) => tokens[at + i] === word)) return true;
  }
  return false;
}

/** The time of day a must-do's own words name, or null when they name none. */
export function timeWords(text: string): TimeOfDay | null {
  const plain = nameTokens(text);
  const toned = tonedTokens(text);
  for (const [time, plainRuns, tonedRuns] of WORDS) {
    if (plainRuns.some((run) => contains(plain, run.split(' ')))) return time;
    if (tonedRuns.some((run) => contains(toned, tonedTokens(run)))) return time;
  }
  return null;
}

/** The start window of a timed stop, or null for an untimed one. */
export function timeWindow(when: WishTime | null | undefined): StartWindow | null {
  return when === null || when === undefined || when === 'any' ? null : WISH_TIME_STARTS[when];
}

/** How long a stop lasts at its time of day: a full-day place gets a full day. */
export function timedDuration(poi: DraftPoi, when: WishTime | null | undefined): number {
  return when === 'full_day' ? Math.max(poi.durationMin, FULL_DAY_MIN) : poi.durationMin;
}

/**
 * The minutes a stop held to `when` may start between at `poi` on `date`: its time of day, cut to
 * what the place's own hours allow. Where the hours allow none of it, the one start nearest to it
 * that still fits a whole visit (a sunrise at a place that opens at seven is at seven; a night
 * wish at a market that shuts at seven ends at seven). Hours that are only a guess change
 * nothing. Null for an untimed stop, and when the place has no opening that fits the visit that
 * day (the stop cannot be held there at all).
 */
export function heldWindow(
  poi: DraftPoi,
  date: string,
  when: WishTime | null | undefined,
): StartWindow | null {
  const wished = showtime(poi, when) ?? lateOf(poi, date, when);
  if (wished === null || poi.hours === null || poi.hoursGuessed === true) return wished;
  const visit = ceilGrid(timedDuration(poi, when));
  let nearest: { readonly at: number; readonly away: number } | null = null;
  for (const span of spansOn(poi.hours, date)) {
    const first = ceilGrid(span.start);
    const last = floorGrid(span.end - visit);
    if (last < first) continue;
    const fromMin = Math.max(wished.fromMin, first);
    const toMin = Math.min(wished.toMin, last);
    if (fromMin <= toMin) return { fromMin, toMin };
    const at = last < wished.fromMin ? last : first;
    const away = last < wished.fromMin ? wished.fromMin - last : first - wished.toMin;
    if (nearest === null || away < nearest.away) nearest = { at, away };
  }
  return nearest === null ? null : { fromMin: nearest.at, toMin: nearest.at };
}

/**
 * An evening or night wish at a place that is itself for the sunset, the evening or after dark
 * starts no earlier than the place's own time that day (the fire show on the bridge waits for the
 * dark, not just for five o'clock). When the place's time begins after the wish's window closes,
 * the stop starts when the place's time does: later than wished, never earlier.
 */
function lateOf(
  poi: DraftPoi,
  date: string,
  when: WishTime | null | undefined,
): StartWindow | null {
  const wished = timeWindow(when);
  if (wished === null || (when !== 'evening' && when !== 'night')) return wished;
  const late = placeTimes(poi).find((time) => time !== 'morning');
  if (late === undefined) return wished;
  const own = timeOfDayWindow(late, poi, date);
  const fromMin = Math.max(wished.fromMin, own.fromMin);
  return { fromMin, toMin: Math.max(fromMin, Math.min(wished.toMin, own.toMin)) };
}

/**
 * The hour our editors give a place for the evening ("before the 9pm show", "the show at
 * 21:00"): an evening or night wish there starts within a quarter of an hour of it. A place
 * with typed facts has no such line read: its evening is the evening's usual window.
 */
function showtime(poi: DraftPoi, when: WishTime | null | undefined): StartWindow | null {
  if ((when !== 'evening' && when !== 'night') || poi.bestTime == null || isTyped(poi)) return null;
  const found =
    /\b(\d{1,2})(?::(\d{2}))?\s*(pm|p\.m\.)/iu.exec(poi.bestTime) ??
    /\b(\d{1,2}):(\d{2})\b/u.exec(poi.bestTime);
  if (found === null) return null;
  const hour = Number(found[1]) + (found[3] === undefined || Number(found[1]) === 12 ? 0 : 12);
  const minute = hour * 60 + Number(found[2] ?? 0);
  if (minute < 17 * 60 || minute > 23 * 60) return null;
  return { fromMin: minute - 15, toMin: minute + 15 };
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
