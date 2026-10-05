/**
 * When in the day a place is suggested for, by the same rules the drafted days follow
 * (../draft/day-rules): a place for the sunset, the evening or after dark goes there, a morning
 * place before eleven, a place that serves meals at lunch or dinner. These are the place's own
 * hours of the day: a slot inside them is preferred to any slot outside. Every other place has no
 * hour of its own and is only nudged: from mid-morning on rather than its opening minute, and a
 * place seen by daylight begun by sunset.
 */
import {
  DINNER,
  DINNER_LAST_START_MIN,
  foodRole,
  LUNCH,
  LUNCH_LAST_START_MIN,
  MORNING_ENDS_MIN,
  placeTime,
  placeWindow,
  timeOfDayWindow,
  type PlaceWindow,
} from '../draft/day-rules';
import type { DraftPoi } from '../draft/types';
import type { FitPlace } from './context';

/** The time of day a place is for, as the app can say it; null = any time will do. */
export type KindTime = 'morning' | 'sunset' | 'evening' | 'after_dark' | 'meal';

/** Where a place with no hour of its own starts from: not at its opening minute. */
export const MID_MORNING_MIN = 10 * 60;

/** The place as the day rules read it. */
function asPoi(place: FitPlace, tz: string, visitMin: number): DraftPoi {
  return {
    id: place.poiId ?? 'place',
    name: place.name ?? '',
    category: place.category,
    lat: place.point.lat,
    lng: place.point.lng,
    tz,
    hours: place.hours,
    hoursGuessed: place.hours === null,
    priceLevel: null,
    tags: place.tags ?? [],
    durationMin: visitMin,
    editorial: false,
    mustSee: false,
    bestTime: place.bestTimeText ?? null,
  };
}

export function kindTimeOf(place: FitPlace, tz: string, visitMin: number): KindTime | null {
  const poi = asPoi(place, tz, visitMin);
  return foodRole(poi) === 'meal' ? 'meal' : placeTime(poi);
}

export interface KindWindows {
  /** The place's own hours of the day (start minutes); empty when it has none. */
  readonly own: readonly PlaceWindow[];
  /** Where a place with no hour of its own is nudged to. */
  readonly usual: PlaceWindow;
}

export function kindWindows(
  place: FitPlace,
  date: string,
  tz: string,
  visitMin: number,
): KindWindows {
  const poi = asPoi(place, tz, visitMin);
  const usual: PlaceWindow = {
    fromMin: MID_MORNING_MIN,
    toMin: Math.max(MID_MORNING_MIN, placeWindow(poi, date)?.toMin ?? 24 * 60),
  };
  if (foodRole(poi) === 'meal') {
    return {
      own: [
        { fromMin: LUNCH.startMin, toMin: LUNCH_LAST_START_MIN },
        { fromMin: DINNER.startMin, toMin: DINNER_LAST_START_MIN },
      ],
      usual,
    };
  }
  const time = placeTime(poi);
  if (time === null) return { own: [], usual };
  if (time === 'morning') return { own: [{ fromMin: 0, toMin: MORNING_ENDS_MIN }], usual };
  return { own: [timeOfDayWindow(time, poi, date)], usual };
}

/** Minutes `start` is outside the nearest of `windows`; 0 inside one (or with none). */
export function minutesOutside(windows: readonly PlaceWindow[], start: number): number {
  if (windows.length === 0) return 0;
  return Math.min(
    ...windows.map((window) =>
      start < window.fromMin
        ? window.fromMin - start
        : start > window.toMin
          ? start - window.toMin
          : 0,
    ),
  );
}
