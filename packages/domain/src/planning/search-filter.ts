/**
 * Search filters and their chips (docs/api-contracts-planning.md, search): what a plain-words
 * question becomes ("quiet dinner near the villa, open late" → DINNER · QUIET · ≤ 15 MIN FROM THE
 * VILLA · OPEN PAST 22:00 · NOT WED). The model only fills this vocabulary; ids come from the
 * trip's own digest, and the line under the chips is a template on `exclude_reason`, never model
 * text. Unknown words stay in `text` and search by name.
 */
import { z } from 'zod';

import { poiCategorySchema } from '../places/categories';
import { clockTimeSchema } from './fit';

export const SEARCH_MEALS = ['breakfast', 'lunch', 'dinner', 'coffee', 'drinks'] as const;
export const searchMealSchema = z.enum(SEARCH_MEALS);

export const SEARCH_ATTRIBUTES = [
  'quiet',
  'view',
  'late',
  'outdoor',
  'indoor',
  'cheap',
  'kid_friendly',
  'vegetarian',
  'local',
  'sunset',
] as const;
export const searchAttributeSchema = z.enum(SEARCH_ATTRIBUTES);
export type SearchAttribute = z.infer<typeof searchAttributeSchema>;

/** Where "≤ N min" is measured from: the stay, a place, or the route of a day. */
export const maxMinutesSchema = z.discriminatedUnion('from', [
  z.strictObject({ from: z.literal('stay'), minutes: z.number().int().min(5).max(240) }),
  z.strictObject({
    from: z.literal('poi'),
    poi_id: z.uuid(),
    minutes: z.number().int().min(5).max(240),
  }),
  z.strictObject({
    from: z.literal('day_route'),
    day_id: z.uuid(),
    minutes: z.number().int().min(5).max(240),
  }),
]);
export type MaxMinutes = z.infer<typeof maxMinutesSchema>;

export const EXCLUDE_REASONS = ['day_has_meal', 'day_full', 'day_travel'] as const;
export const excludeReasonSchema = z.strictObject({
  code: z.enum(EXCLUDE_REASONS),
  params: z.strictObject({
    day_ids: z.array(z.uuid()).min(1),
    stable_id: z.uuid().optional(),
  }),
});
export type ExcludeReason = z.infer<typeof excludeReasonSchema>;

export const searchFilterSchema = z.strictObject({
  text: z.string().trim().max(200).optional(),
  categories: z.array(poiCategorySchema).max(6).optional(),
  meal: searchMealSchema.optional(),
  attributes: z.array(searchAttributeSchema).max(6).optional(),
  open_past: clockTimeSchema.optional(),
  max_minutes: maxMinutesSchema.optional(),
  exclude_day_ids: z.array(z.uuid()).max(60).optional(),
  /** Price level, 1 (cheap) to 4. */
  price_max: z.number().int().min(1).max(4).optional(),
});
export type SearchFilter = z.infer<typeof searchFilterSchema>;

/** One removable chip under the search field; removing it reruns the search without it. */
export const searchChipSchema = z.discriminatedUnion('code', [
  z.strictObject({
    code: z.literal('category'),
    params: z.strictObject({ category: poiCategorySchema }),
  }),
  z.strictObject({ code: z.literal('meal'), params: z.strictObject({ meal: searchMealSchema }) }),
  z.strictObject({
    code: z.literal('attribute'),
    params: z.strictObject({ attribute: searchAttributeSchema }),
  }),
  z.strictObject({
    code: z.literal('open_past'),
    params: z.strictObject({ time: clockTimeSchema }),
  }),
  z.strictObject({ code: z.literal('max_minutes'), params: maxMinutesSchema }),
  z.strictObject({
    code: z.literal('exclude_days'),
    params: z.strictObject({ day_ids: z.array(z.uuid()).min(1) }),
  }),
  z.strictObject({
    code: z.literal('price_max'),
    params: z.strictObject({ level: z.number().int().min(1).max(4) }),
  }),
]);
export type SearchChip = z.infer<typeof searchChipSchema>;

/** `POST /v1/trips/{id}/search/parse` answers this; a declined parse is `{filters: {text: q}}`. */
export const searchParseResultSchema = z.strictObject({
  filters: searchFilterSchema,
  chips: z.array(searchChipSchema).max(10),
  exclude_reason: excludeReasonSchema.optional(),
});
export type SearchParseResult = z.infer<typeof searchParseResultSchema>;
