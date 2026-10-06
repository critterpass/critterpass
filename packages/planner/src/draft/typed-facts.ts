/**
 * A place read from its typed facts (`bestTimes`, `visitMin`, `mealRole`, `dish`,
 * `essentialRank`: its profile, else its kind's default, see ./open-data) instead of the editors'
 * free text. The loader sets them only while the server key `planner.typed_places` is on; a place
 * that has them never reaches the text readers (./place-time, ./food-role's name reading,
 * ./wish-time's showtimes, ./place-names). The rules are the planner's own and stay: a food stop
 * of twenty minutes or less is a snack; a meal place follows meal times; a night venue with no
 * time of its own is for after dark; a sunset, evening or after-dark time narrows an afternoon.
 */
import type { PlaceBestTime } from '@cp/domain';

import type { Collapsed } from './same-place';
import type { DraftPoi } from './types';

export type TypedPoi = DraftPoi & { readonly bestTimes: readonly PlaceBestTime[] };

/** Whether `poi` carries typed facts (the server key was on when it was loaded). */
export function isTyped(poi: DraftPoi): poi is TypedPoi {
  return poi.bestTimes !== undefined;
}

/** One of the handful of places a first visit should hold. */
export function isEssential(poi: DraftPoi): boolean {
  return isTyped(poi)
    ? poi.essentialRank !== null && poi.essentialRank !== undefined
    : poi.essential === true;
}

const SIT_DOWN: ReadonlySet<string> = new Set(['sit_down_dining', 'sit_down']);
/** A food stop this long or less is eaten standing: a break, not a meal. */
const SNACK_MAX_MIN = 20;
/** Kinds a place to eat is filed under; a market or a sight is never the day's lunch. */
const EATING_KINDS: ReadonlySet<string> = new Set(['food', 'nightlife', 'other']);

/** A meal place (lunch or dinner), a break (coffee, a snack), or not food at all. */
export function typedFoodRole(poi: TypedPoi): 'meal' | 'light' | null {
  if (!EATING_KINDS.has(poi.category)) return null;
  if (poi.mealRole === 'light') return 'light';
  if (poi.mealRole !== 'meal') return null;
  const quick = poi.durationMin <= SNACK_MAX_MIN && !poi.tags.some((tag) => SIT_DOWN.has(tag));
  return quick && poi.category === 'food' ? 'light' : 'meal';
}

export type TypedTime = 'morning' | 'sunset' | 'evening' | 'after_dark';

/**
 * The times of day a place holds a stop to: none when any time will do (a midday, or an afternoon
 * with nothing later), a morning, a late time (after dark over the evening over the sunset), or a
 * morning and a late one. Meal places follow meal times instead.
 */
export function typedPlaceTimes(poi: TypedPoi): readonly TypedTime[] {
  if (typedFoodRole(poi) === 'meal') return [];
  const has = (time: PlaceBestTime) => poi.bestTimes.includes(time);
  const night = poi.category === 'nightlife' || poi.tags.includes('nightlife');
  const morning = has('early_morning') || has('morning');
  const late: TypedTime | null =
    has('after_dark') || (night && poi.bestTimes.length > 0 && !morning)
      ? 'after_dark'
      : has('sunset')
        ? 'sunset'
        : has('evening')
          ? 'evening'
          : null;
  if (poi.bestTimes.length === 0) {
    return night && typedFoodRole(poi) === null ? ['after_dark'] : [];
  }
  if (has('midday') || (has('afternoon') && late === null)) return [];
  return [...(morning ? (['morning'] as const) : []), ...(late === null ? [] : [late])];
}

/** How strongly a place needs the start of the day: 2 early morning, 1 morning, else 0. */
export function typedEarlyNeed(bestTimes: readonly PlaceBestTime[]): number {
  if (bestTimes.includes('early_morning')) return 2;
  return bestTimes.includes('morning') ? 1 : 0;
}

/** The meals a place's times narrow it to (lunch by day, dinner late); null when both or neither. */
export function typedMealTime(poi: TypedPoi): 'lunch' | 'dinner' | null {
  const has = (time: PlaceBestTime) => poi.bestTimes.includes(time);
  const lunch = has('early_morning') || has('morning') || has('midday');
  const dinner = has('sunset') || has('evening') || has('after_dark');
  return lunch === dinner ? null : lunch ? 'lunch' : 'dinner';
}

/** A dish in one spelling: accents folded, lowercase, "mỳ" and "mì" alike. */
export function typedDish(poi: TypedPoi): string | null {
  const dish = poi.dish
    ?.normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .replaceAll('y', 'i')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .join(' ');
  return dish === undefined || dish === '' ? null : dish;
}

/** Two places known for the same dish, or one's dish inside the other's ("banh can" in "banh can tom"). */
export function typedSharesDish(a: TypedPoi, b: TypedPoi): boolean {
  if (a.id === b.id) return true;
  const one = typedDish(a);
  const two = typedDish(b);
  if (one === null || two === null) return false;
  const within = (short: string, long: string) => ` ${long} `.includes(` ${short} `);
  return within(one, two) || within(two, one);
}

/** Places as they come, one row each: typed places' listings are merged where they are stored. */
export function onePerRow(pois: readonly DraftPoi[]): Collapsed {
  return { kept: pois, mentions: new Map(), keptFor: new Map(pois.map((poi) => [poi.id, poi.id])) };
}
