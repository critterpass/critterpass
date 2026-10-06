/**
 * Open-data places (not curated by our editors) carry no opening hours and no visit length. When a
 * typed must-do names one, it is planned with the hours places of its kind usually keep, so a
 * mountain park is not put on the evening schedule because nothing said it closes. Those hours are
 * marked as a guess: they shape a plain visit, and never overrule the time of day a must-do is
 * held to. Curated places keep what the editors wrote (unknown hours stay unknown).
 */
import type { Hours, PlaceBestTime, PlaceMealRole } from '@cp/domain';

import { derivedDurationMin } from './long-visits';
import { defaultDurationMin } from './schedule-day';
import type { DraftPoi } from './types';

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const;

const USUAL_HOURS: Readonly<Record<string, readonly [string, string]>> = {
  nature: ['07:00', '17:30'],
  temple_shrine: ['06:00', '18:00'],
  museum: ['08:00', '17:00'],
  market: ['06:00', '19:00'],
  beach: ['05:00', '19:00'],
  shopping: ['09:00', '21:00'],
  nightlife: ['18:00', '24:00'],
  food: ['07:00', '22:00'],
};

/** The hours places of `category` usually keep (eight to six for a kind we have no usual for). */
export function usualHours(category: string): Hours {
  const span = USUAL_HOURS[category] ?? ['08:00', '18:00'];
  return {
    weekly: Object.fromEntries(DAYS.map((day) => [day, [{ start: span[0], end: span[1] }]])),
  };
}

/** An open-data place with the usual hours and visit length of its kind where it has none. */
export function withOpenDataDefaults(poi: DraftPoi): DraftPoi {
  if (poi.editorial) return poi;
  return {
    ...poi,
    ...(poi.hours === null ? { hours: usualHours(poi.category), hoursGuessed: true } : {}),
    durationMin: poi.durationMin > 0 ? poi.durationMin : defaultDurationMin(poi.category),
  };
}

/** A place's typed facts as its profile holds them (any of them may be empty). */
export interface ProfileFacts {
  readonly bestTimes: readonly PlaceBestTime[];
  readonly visitMin: number | null;
  readonly mealRole: PlaceMealRole | null;
  readonly dish: string | null;
}

const MEAL_TAGS: ReadonlySet<string> = new Set(['sit_down_dining', 'sit_down', 'street_food']);
const LIGHT_TAGS: ReadonlySet<string> = new Set([
  'coffee',
  'cafe',
  'dessert',
  'bakery',
  'tea',
  'ice_cream',
]);

/**
 * What a place of `category` with `tags` is taken to be until it has a profile: any time of day
 * (the kind's own rules still apply: a night venue after dark, a beach early or late), the kind's
 * usual visit (a theme park the day, a hike half of it), and food by its tags (a cafe a break,
 * any other eatery a meal; a venue that serves meals by its tags too).
 */
export function kindFacts(category: string, tags: readonly string[]): ProfileFacts {
  const meal = tags.some((tag) => MEAL_TAGS.has(tag));
  const light = tags.some((tag) => LIGHT_TAGS.has(tag));
  const venue = (category === 'nightlife' || category === 'other') && !tags.includes('markets');
  return {
    bestTimes: [],
    visitMin: derivedDurationMin(category, tags, []),
    mealRole:
      category === 'food' ? (light && !meal ? 'light' : 'meal') : venue && meal ? 'meal' : 'none',
    dish: null,
  };
}

/**
 * `poi` with its typed facts: the profile's where it has one, the kind's where it has none (or
 * left one empty). A visit length our editors gave wins over both, as any reviewed field does.
 */
export function withTypedFacts(
  poi: DraftPoi,
  facts: {
    readonly profile: ProfileFacts | null;
    readonly editorsVisitMin: number | null;
    readonly essentialRank: number | null;
  },
): DraftPoi {
  const kind = kindFacts(poi.category, poi.tags);
  const profile = facts.profile;
  const visitMin = facts.editorsVisitMin ?? profile?.visitMin ?? kind.visitMin ?? 90;
  return {
    ...poi,
    durationMin: visitMin,
    visitMin,
    bestTimes:
      profile !== null && profile.bestTimes.length > 0 ? profile.bestTimes : kind.bestTimes,
    mealRole: profile?.mealRole ?? kind.mealRole ?? 'none',
    dish: profile?.dish ?? null,
    essentialRank: facts.essentialRank,
  };
}
