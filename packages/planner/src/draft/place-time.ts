/**
 * The time of day a place is for, read from what its row says: a bar or a night market is for
 * after dark, a beach our editors recommend "at sunset" is for the sunset, a market "in the
 * morning when vendors are fresh" for the morning. The planner keeps any stop at a sunset, evening
 * or after-dark place inside that time (a must-do with its own time of day keeps that instead, see
 * ./wish-time), so a draft never sends a crew to a bar at ten in the morning or to the lit-up
 * bridge in daylight. The morning is a preference, not a rule: where most places are "best early",
 * holding each to the morning would leave every afternoon empty, so the planner only puts morning
 * places first when it orders a day (./sequence).
 *
 * Evening times follow the sun at the place on the date (`solarDay`), within clock bounds so a
 * far-north summer does not push the evening to midnight. A line that names two times of day
 * ("early morning or late afternoon") or says "any time" holds nothing.
 */
import { solarDay } from '@cp/domain';

import { localMinute } from '../feasibility/grid';
import { ceilGrid, floorGrid, spansOn } from './day-minutes';
import { foodRole } from './food-role';
import { nameTokens } from './place-names';
import type { DraftPoi } from './types';

export type PlaceTime = 'morning' | 'sunset' | 'evening' | 'after_dark';

/** The local minutes a stop may start between. */
export interface PlaceWindow {
  readonly fromMin: number;
  readonly toMin: number;
}

type Named = PlaceTime | 'midday';

/** Word runs (accents folded, plurals folded) that name a time of day in our editors' lines. */
const WORDS: readonly (readonly [Named, readonly string[]])[] = [
  ['morning', ['morning', 'sunrise', 'dawn', 'breakfast', 'buoi sang']],
  ['midday', ['lunch', 'lunchtime', 'midday', 'noon', 'afternoon', 'daytime', 'anytime']],
  ['midday', ['any time', 'all day', 'buoi chieu', 'buoi trua']],
  ['sunset', ['sunset', 'dusk', 'golden hour', 'hoang hon']],
  ['evening', ['evening', 'dinner', 'happy hour', 'buoi toi']],
  ['after_dark', ['night', 'after dark', 'nightfall', 'ban dem']],
];

function contains(tokens: readonly string[], phrase: readonly string[]): boolean {
  for (let at = 0; at + phrase.length <= tokens.length; at += 1) {
    if (phrase.every((word, i) => tokens[at + i] === word)) return true;
  }
  return false;
}

/** Every time of day a line names. */
function timesNamed(text: string | null | undefined): Set<Named> {
  const found = new Set<Named>();
  if (text === null || text === undefined) return found;
  const tokens = nameTokens(text);
  for (const [time, phrases] of WORDS) {
    if (phrases.some((phrase) => contains(tokens, phrase.split(' ')))) found.add(time);
  }
  return found;
}

const TIMES = new WeakMap<DraftPoi, PlaceTime | null>();

/** The time of day `poi` is for, or null when any time will do. Meal places follow meal times. */
export function placeTime(poi: DraftPoi): PlaceTime | null {
  const cached = TIMES.get(poi);
  if (cached !== undefined) return cached;
  const time = readTime(poi);
  TIMES.set(poi, time);
  return time;
}

function readTime(poi: DraftPoi): PlaceTime | null {
  if (foodRole(poi) === 'meal') return null;
  const night = poi.category === 'nightlife' || poi.tags.includes('nightlife');
  const named = timesNamed(poi.bestTime);
  if (named.size === 0) return night && foodRole(poi) === null ? 'after_dark' : null;
  if (named.has('midday') || (named.has('morning') && named.size > 1)) return null;
  if (named.has('morning')) return 'morning';
  if (named.has('after_dark') || night) return 'after_dark';
  return named.has('sunset') ? 'sunset' : 'evening';
}

const SUNSETS = new Map<string, number>();
const DEFAULT_SUNSET_MIN = 18 * 60;

/** Sunset at the place on the date as a local minute, kept between four and nine in the evening. */
export function sunsetMin(poi: Pick<DraftPoi, 'lat' | 'lng' | 'tz'>, date: string): number {
  const key = `${date}:${poi.lat.toFixed(1)}:${poi.lng.toFixed(1)}:${poi.tz}`;
  const known = SUNSETS.get(key);
  if (known !== undefined) return known;
  const at = solarDay(date, poi.lat, poi.lng).sunset;
  const minute = at === null ? DEFAULT_SUNSET_MIN : localMinute(at, poi.tz);
  const kept = Math.min(21 * 60, Math.max(16 * 60, minute));
  SUNSETS.set(key, kept);
  return kept;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The start window of each time of day at `poi` on `date`, before its opening hours. */
export function timeOfDayWindow(time: PlaceTime, poi: DraftPoi, date: string): PlaceWindow {
  const sunset = sunsetMin(poi, date);
  switch (time) {
    case 'morning':
      return { fromMin: 0, toMin: MORNING_ENDS_MIN };
    case 'sunset': {
      // There before the sun goes, and still there when it does.
      const fromMin = ceilGrid(sunset - clamp(poi.durationMin, 45, 90));
      return { fromMin, toMin: Math.max(fromMin, floorGrid(sunset)) };
    }
    case 'evening': {
      const fromMin = clamp(ceilGrid(sunset - 30), 17 * 60, 19 * 60 + 30);
      return { fromMin, toMin: fromMin + 150 };
    }
    case 'after_dark': {
      const fromMin = clamp(ceilGrid(sunset + 30), 17 * 60 + 30, 20 * 60 + 30);
      return { fromMin, toMin: Math.max(fromMin, 21 * 60 + 30) };
    }
  }
}

/** A stop at a morning place that starts after this local minute is later than the place is best. */
export const MORNING_ENDS_MIN = 11 * 60;

/**
 * The minutes a stop at `poi` may start between on `date` because of the time of day the place is
 * for; null when it has none or is only better in the morning, or when its own opening hours leave
 * no start inside that time (the hours win, and the stop is planned like any other).
 */
export function placeWindow(poi: DraftPoi, date: string): PlaceWindow | null {
  const time = placeTime(poi);
  if (time === null || time === 'morning') return null;
  const window = timeOfDayWindow(time, poi, date);
  if (poi.hours === null || poi.hoursGuessed === true) return window;
  const visit = ceilGrid(poi.durationMin);
  for (const span of spansOn(poi.hours, date)) {
    const fromMin = Math.max(window.fromMin, ceilGrid(span.start));
    const toMin = Math.min(window.toMin, floorGrid(span.end - visit));
    if (fromMin <= toMin) return { fromMin, toMin };
  }
  return null;
}
