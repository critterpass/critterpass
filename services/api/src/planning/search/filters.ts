/**
 * Plain-words search filters on `GET /v1/places/search` (docs/api-contracts-planning.md, search):
 * the query parameters a chip row turns into, and what each attribute means for a place. A place
 * has an attribute when its editorial tags say so or its category or price does ("outdoor" for a
 * beach, "cheap" for price level 1); "late" also holds when its hours run past 23:00 on a day
 * the search looks at. Nothing here guesses from the name.
 */
import {
  clockTimeSchema,
  poiCategorySchema,
  searchAttributeSchema,
  searchMealSchema,
  type MaxMinutes,
  type PoiCategory,
  type SearchAttribute,
  type SearchFilter,
  type SEARCH_MEALS,
} from '@cp/domain';
import { z } from 'zod';

import { openPast, type DaySpans } from './hours';

export type SearchMeal = (typeof SEARCH_MEALS)[number];

const commaList = <T extends z.ZodType<unknown, string>>(item: T) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== ''),
    )
    .pipe(z.array(item).max(60));

const MAX_MINUTES = /^(stay|poi|day_route):(?:([0-9a-f-]{36}):)?(\d{1,3})$/u;

/** `stay:15`, `poi:<uuid>:15` or `day_route:<uuid>:15`. */
export const maxMinutesParamSchema = z.string().transform((value, ctx): MaxMinutes => {
  const match = MAX_MINUTES.exec(value);
  const minutes = Number(match?.[3]);
  const id = match?.[2];
  if (match !== null && minutes >= 5 && minutes <= 240) {
    if (match[1] === 'stay' && id === undefined) return { from: 'stay', minutes };
    if (match[1] === 'poi' && id !== undefined) return { from: 'poi', poi_id: id, minutes };
    if (match[1] === 'day_route' && id !== undefined) {
      return { from: 'day_route', day_id: id, minutes };
    }
  }
  ctx.addIssue({ code: 'custom', message: 'must be stay:N, poi:<id>:N or day_route:<id>:N' });
  return z.NEVER;
});

/** The parameters a plain-words search adds; any one of them switches the route to trip search. */
export const tripSearchQuerySchema = z.object({
  trip_id: z.uuid().optional(),
  categories: commaList(poiCategorySchema).optional(),
  attrs: commaList(searchAttributeSchema).optional(),
  meal: searchMealSchema.optional(),
  open_past: clockTimeSchema.optional(),
  max_minutes: maxMinutesParamSchema.optional(),
  exclude_day_ids: commaList(z.uuid()).optional(),
  price_max: z.coerce.number().int().min(1).max(4).optional(),
  fit: z.enum(['0', '1']).optional(),
  relax: z.enum(['0', '1']).optional(),
  /** The question as she typed it: places named for the thing she asked for come first. */
  words: z.string().trim().max(300).optional(),
});
export type TripSearchQuery = z.infer<typeof tripSearchQuerySchema>;

export const TRIP_SEARCH_PARAMS = Object.keys(tripSearchQuerySchema.shape);

/** The domain filter a query asks for (the text is the route's `q`). */
export function filterOf(query: TripSearchQuery, q: string | undefined): SearchFilter {
  return {
    ...(q === undefined ? {} : { text: q }),
    ...(query.categories === undefined ? {} : { categories: query.categories }),
    ...(query.meal === undefined ? {} : { meal: query.meal }),
    ...(query.attrs === undefined ? {} : { attributes: query.attrs }),
    ...(query.open_past === undefined ? {} : { open_past: query.open_past }),
    ...(query.max_minutes === undefined ? {} : { max_minutes: query.max_minutes }),
    ...(query.exclude_day_ids === undefined ? {} : { exclude_day_ids: query.exclude_day_ids }),
    ...(query.price_max === undefined ? {} : { price_max: query.price_max }),
  };
}

/**
 * A kind of place as a word to look for near a meal: "dinner by the beach" is a place to eat with
 * the beach in its name, address or tags, never a beach that serves dinner.
 */
export const CATEGORY_NEAR_WORD: Partial<Record<PoiCategory, string>> = {
  beach: 'beach',
  temple_shrine: 'temple',
  market: 'market',
  museum: 'museum',
};

/** The kinds of place a meal is eaten at, when the search names no category itself. */
export const MEAL_CATEGORIES: Readonly<Record<SearchMeal, readonly PoiCategory[]>> = {
  breakfast: ['food'],
  lunch: ['food'],
  dinner: ['food'],
  coffee: ['food'],
  drinks: ['food', 'nightlife'],
};

const ATTRIBUTE_TAGS: Readonly<Record<SearchAttribute, readonly string[]>> = {
  quiet: ['quiet', 'calm', 'peaceful', 'easy_pace', 'hidden_gem', 'romantic'],
  view: ['view', 'views', 'viewpoint', 'scenic', 'rooftop', 'photo_spots', 'rice_terraces'],
  late: ['late', 'late_night', 'late_starts', 'open_late'],
  outdoor: ['outdoor', 'garden', 'terrace', 'rooftop', 'hiking', 'open_air'],
  indoor: ['indoor', 'air_conditioned'],
  cheap: ['cheap', 'budget', 'street_food', 'warung'],
  kid_friendly: ['kid_friendly', 'kids', 'family', 'family_friendly'],
  vegetarian: ['vegetarian', 'vegan', 'vegetarian_options', 'plant_based'],
  local: ['local', 'local_life', 'warung', 'street_food'],
  sunset: ['sunset', 'sunset_view', 'sunset_spot'],
};

const ATTRIBUTE_CATEGORIES: Partial<Record<SearchAttribute, readonly PoiCategory[]>> = {
  outdoor: ['nature', 'beach'],
  indoor: ['museum', 'shopping'],
};

const normaliseTag = (tag: string) =>
  tag
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/gu, '_');

export interface AttributePlace {
  readonly category: PoiCategory;
  readonly tags: readonly string[];
  readonly priceLevel: number | null;
}

export function hasAttribute(
  place: AttributePlace,
  attribute: SearchAttribute,
  days: DaySpans,
): boolean {
  const tags = new Set(place.tags.map(normaliseTag));
  if (ATTRIBUTE_TAGS[attribute].some((tag) => tags.has(tag))) return true;
  if (ATTRIBUTE_CATEGORIES[attribute]?.includes(place.category) === true) return true;
  if (attribute === 'cheap') return place.priceLevel === 1;
  if (attribute === 'late') return openPast(days, '23:00') === true;
  return false;
}
