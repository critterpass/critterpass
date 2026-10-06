/**
 * The time of day a place is for, read from its editors' text; a place with typed facts is read
 * by ./typed-facts instead, and ./time-of-day turns either into start windows. A bar or a night
 * market is for after dark, a beach our editors recommend "at sunset" is for the sunset, a market
 * "in the morning when vendors are fresh" for the morning. "Late afternoon" is the hour before
 * sunset, and a sunset, evening or after-dark word wins over "afternoon" ("late afternoon for
 * sunset"). A line that names two times of day ("early morning or late afternoon") holds the stop
 * to either of them; one that says "any time" or "midday" holds nothing.
 */
import { foodRole } from './food-role';
import { nameTokens } from './place-names';
import type { PlaceTime } from './time-of-day';
import type { DraftPoi } from './types';

type Named = PlaceTime | 'midday' | 'afternoon';

/** Word runs (accents folded, plurals folded) that name a time of day in our editors' lines. */
const WORDS: readonly (readonly [Named, readonly string[]])[] = [
  [
    'morning',
    [
      'morning',
      'sunrise',
      'dawn',
      'breakfast',
      'buoi sang',
      'at opening',
      'before 8am',
      'before 9am',
    ],
  ],
  ['midday', ['lunch', 'lunchtime', 'midday', 'noon', 'daytime', 'anytime']],
  ['midday', ['any time', 'all day', 'buoi trua']],
  ['afternoon', ['afternoon', 'buoi chieu']],
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
  // "Late afternoon" is the hour before sunset, not the middle of the day.
  const tokens = nameTokens(text).flatMap((token, at, all) =>
    token === 'late' && all[at + 1] === 'afternoon'
      ? ['dusk']
      : token === 'afternoon' && all[at - 1] === 'late'
        ? []
        : [token],
  );
  for (const [time, phrases] of WORDS) {
    if (phrases.some((phrase) => contains(tokens, phrase.split(' ')))) found.add(time);
  }
  // A sunset, evening or after-dark word says which part of the afternoon.
  if (found.has('sunset') || found.has('evening') || found.has('after_dark')) {
    found.delete('afternoon');
  }
  return found;
}

const TIMES = new WeakMap<DraftPoi, readonly PlaceTime[]>();

/**
 * Every time of day `poi`'s text says it is for: none when any time will do, one, or two for a
 * line that names a morning and a later time ("early morning or late afternoon"). Meal places
 * follow meal times.
 */
export function textPlaceTimes(poi: DraftPoi): readonly PlaceTime[] {
  const cached = TIMES.get(poi);
  if (cached !== undefined) return cached;
  const times = readTimes(poi);
  TIMES.set(poi, times);
  return times;
}

function readTimes(poi: DraftPoi): PlaceTime[] {
  if (foodRole(poi) === 'meal') return [];
  const night = poi.category === 'nightlife' || poi.tags.includes('nightlife');
  const named = timesNamed(poi.bestTime);
  if (named.size === 0) return night && foodRole(poi) === null ? ['after_dark'] : [];
  if (named.has('midday') || named.has('afternoon')) return [];
  const late: PlaceTime | null =
    named.has('after_dark') || (night && named.size > 0 && !named.has('morning'))
      ? 'after_dark'
      : named.has('sunset')
        ? 'sunset'
        : named.has('evening')
          ? 'evening'
          : null;
  return [
    ...(named.has('morning') ? (['morning'] as const) : []),
    ...(late === null ? [] : [late]),
  ];
}
