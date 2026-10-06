/**
 * The time of day a place is for and the minutes a stop there may start between. The time is read
 * from the place's typed facts (./typed-facts) when it has them, else from its editors' text
 * (./place-time). The planner keeps any stop at a sunset, evening or after-dark place inside that
 * time (a must-do with its own time of day keeps that instead, see ./wish-time), so a draft never
 * sends a crew to a bar at ten in the morning or to the lit-up bridge in daylight. The morning is
 * a preference, not a rule: the planner only puts morning places first when it orders a day
 * (./sequence). A place seen by daylight (a temple, a waterfall, a beach) with no time of its own
 * is never started after sunset, and a place's own opening hours win over its time of day.
 *
 * Evening times follow the sun at the place on the date (`solarDay`), within clock bounds so a
 * far-north summer does not push the evening to midnight. A place for two times of day (early or
 * late) is held to either of them (`placeWindows`).
 */
import { solarDay } from '@cp/domain';

import { localMinute } from '../feasibility/grid';
import { ceilGrid, floorGrid, spansOn } from './day-minutes';
import { textPlaceTimes } from './place-time';
import { isTyped, typedPlaceTimes } from './typed-facts';
import type { DraftPoi } from './types';

export type PlaceTime = 'morning' | 'sunset' | 'evening' | 'after_dark';

/** The local minutes a stop may start between. */
export interface PlaceWindow {
  readonly fromMin: number;
  readonly toMin: number;
}

/** The time of day `poi` is for, or null when any time will do (or it is for two). */
export function placeTime(poi: DraftPoi): PlaceTime | null {
  const times = placeTimes(poi);
  return times.length === 1 ? (times[0] ?? null) : null;
}

/** Every time of day `poi` is for: none when any time will do, one, or a morning and a late one. */
export function placeTimes(poi: DraftPoi): readonly PlaceTime[] {
  return isTyped(poi) ? typedPlaceTimes(poi) : textPlaceTimes(poi);
}

const SUNSETS = new Map<string, number>();
const SUNSETS_OF = new WeakMap<object, Map<string, number>>();
const DEFAULT_SUNSET_MIN = 18 * 60;

/** Sunset at the place on the date as a local minute, kept between four and nine in the evening. */
export function sunsetMin(poi: Pick<DraftPoi, 'lat' | 'lng' | 'tz'>, date: string): number {
  // Asked for on every timing pass: the place's own answers first, without building a key.
  let mine = SUNSETS_OF.get(poi);
  if (mine === undefined) {
    mine = new Map();
    SUNSETS_OF.set(poi, mine);
  }
  const seen = mine.get(date);
  if (seen !== undefined) return seen;
  const key = `${date}:${poi.lat.toFixed(1)}:${poi.lng.toFixed(1)}:${poi.tz}`;
  const known = SUNSETS.get(key);
  if (known !== undefined) {
    mine.set(date, known);
    return known;
  }
  const at = solarDay(date, poi.lat, poi.lng).sunset;
  const minute = at === null ? DEFAULT_SUNSET_MIN : localMinute(at, poi.tz);
  const kept = Math.min(21 * 60, Math.max(16 * 60, minute));
  SUNSETS.set(key, kept);
  mine.set(date, kept);
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

/** Places seen by daylight: nobody is sent to a temple, a waterfall, a beach or a museum after dark. */
/** A morning beach is begun by half past ten; an afternoon one from three. */
const BEACH_MORNING_BY_MIN = 10 * 60 + 30;
const BEACH_AFTERNOON_FROM_MIN = 15 * 60;
/** A daylight visit may run this long past sunset. */
const DUSK_MIN = 30;
const DAYLIGHT: ReadonlySet<string> = new Set(['temple_shrine', 'nature', 'beach', 'museum']);

/**
 * The minutes a stop at `poi` may start between on `date` because of the time of day the place is
 * for. A place for the sunset, the evening or after dark has that time; a daylight place with no
 * time of its own, and any place that is better in the morning, starts by sunset; anything else
 * has none (null). When the place's own opening hours leave no start inside that time, the hours win and
 * the stop is planned like any other (null).
 */
export function placeWindow(poi: DraftPoi, date: string): PlaceWindow | null {
  const time = placeTime(poi);
  // A beach is for early or late in the day, never the hours around noon: early when our
  // editors say the morning, else from mid-afternoon to dusk.
  if (poi.category === 'beach' && (time === null || time === 'morning')) {
    const sunset = sunsetMin(poi, date);
    const window =
      time === 'morning'
        ? { fromMin: 0, toMin: BEACH_MORNING_BY_MIN }
        : {
            fromMin: BEACH_AFTERNOON_FROM_MIN,
            toMin: Math.max(BEACH_AFTERNOON_FROM_MIN, floorGrid(sunset - 30)),
          };
    return withinHours(poi, date, window);
  }
  if (time === null || time === 'morning') {
    const byDay = time === 'morning' || DAYLIGHT.has(poi.category);
    if (!byDay || poi.category === 'nightlife' || poi.tags.includes('nightlife')) return null;
    // Begun by sunset, and a long visit early enough to be over half an hour after it.
    const sunset = sunsetMin(poi, date);
    const toMin = floorGrid(Math.min(sunset, sunset + DUSK_MIN - poi.durationMin));
    return withinHours(poi, date, { fromMin: 0, toMin: Math.max(0, toMin) });
  }
  return withinHours(poi, date, timeOfDayWindow(time, poi, date));
}

/**
 * The windows a stop at `poi` may start in on `date`: `placeWindow`'s one, or for a place named
 * for two times of day, one for each (a beach early or late, never at noon).
 */
export function placeWindows(poi: DraftPoi, date: string): readonly PlaceWindow[] {
  const times = placeTimes(poi);
  if (times.length < 2) {
    const one = placeWindow(poi, date);
    return one === null ? [] : [one];
  }
  return times.flatMap((time) => {
    const window =
      time === 'morning'
        ? poi.category === 'beach'
          ? { fromMin: 0, toMin: BEACH_MORNING_BY_MIN }
          : { fromMin: 0, toMin: MORNING_ENDS_MIN }
        : timeOfDayWindow(time, poi, date);
    const held = withinHours(poi, date, window);
    return held === null ? [] : [held];
  });
}

/** The window a stop reached at `start` starts in: the first that is still open. */
export function windowFor(windows: readonly PlaceWindow[], start: number): PlaceWindow | null {
  return [...windows].sort((a, b) => a.fromMin - b.fromMin).find((w) => w.toMin >= start) ?? null;
}

function withinHours(poi: DraftPoi, date: string, window: PlaceWindow): PlaceWindow | null {
  if (poi.hours === null || poi.hoursGuessed === true) return window;
  const visit = ceilGrid(poi.durationMin);
  for (const span of spansOn(poi.hours, date)) {
    const fromMin = Math.max(window.fromMin, ceilGrid(span.start));
    const toMin = Math.min(window.toMin, floorGrid(span.end - visit));
    if (fromMin <= toMin) return { fromMin, toMin };
  }
  return null;
}
