/**
 * The `search.parse` reply and result. The model fills a closed vocabulary and names days and
 * places by the digest's short refs (`day1`, `place1`); code maps refs back to ids, so no id the
 * trip does not hold can come out. The result is the search filter the screens show as chips
 * (docs/api-contracts-planning.md, search): a wrong guess is one chip to remove.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { POI_CATEGORIES, type PoiCategory } from '@cp/domain';
import { z } from 'zod';

export const SEARCH_MEALS = ['breakfast', 'lunch', 'dinner', 'coffee', 'drinks'] as const;
export type SearchMeal = (typeof SEARCH_MEALS)[number];

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
export type SearchAttribute = (typeof SEARCH_ATTRIBUTES)[number];

export const EXCLUDE_REASONS = ['day_has_meal', 'day_full', 'day_travel'] as const;
export type ExcludeReasonCode = (typeof EXCLUDE_REASONS)[number];

/** "≤ N min" is measured from the stay, a place in the plan, or the route of a day. */
export const NEAR_FROM = ['stay', 'place', 'day'] as const;

export const SEARCH_MINUTES_MIN = 5;
export const SEARCH_MINUTES_MAX = 180;
export const SEARCH_TEXT_MAX = 200;

export const SEARCH_PARSE_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'text',
      'categories',
      'meal',
      'attributes',
      'open_past',
      'near',
      'exclude_days',
      'price_max',
    ],
    properties: {
      text: { type: 'string', description: 'Words left over for a name search; "" when none' },
      categories: { type: 'array', items: { type: 'string', enum: [...POI_CATEGORIES] } },
      meal: { type: ['string', 'null'], enum: [...SEARCH_MEALS, null] },
      attributes: { type: 'array', items: { type: 'string', enum: [...SEARCH_ATTRIBUTES] } },
      open_past: { type: ['string', 'null'], description: 'HH:MM, 24-hour, local time' },
      near: {
        type: ['object', 'null'],
        additionalProperties: false,
        required: ['from', 'ref', 'minutes'],
        properties: {
          from: { type: 'string', enum: [...NEAR_FROM] },
          ref: { type: ['string', 'null'], description: 'A place ref (place1) or day ref (day1)' },
          minutes: { type: 'integer', minimum: SEARCH_MINUTES_MIN, maximum: SEARCH_MINUTES_MAX },
        },
      },
      exclude_days: { type: 'array', items: { type: 'string', description: 'Day refs (day1)' } },
      price_max: { type: ['integer', 'null'], minimum: 1, maximum: 4 },
    },
  },
};

const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);

export const searchParseReplySchema = z.strictObject({
  text: z.string().max(SEARCH_TEXT_MAX),
  categories: z.array(z.enum(POI_CATEGORIES)).max(6),
  meal: z.enum(SEARCH_MEALS).nullable(),
  attributes: z.array(z.enum(SEARCH_ATTRIBUTES)).max(6),
  open_past: clock.nullable(),
  near: z
    .strictObject({
      from: z.enum(NEAR_FROM),
      ref: z.string().nullable(),
      minutes: z.number().int().min(SEARCH_MINUTES_MIN).max(SEARCH_MINUTES_MAX),
    })
    .nullable(),
  exclude_days: z.array(z.string()).max(60),
  price_max: z.number().int().min(1).max(4).nullable(),
});
export type SearchParseReply = z.infer<typeof searchParseReplySchema>;

export type MaxMinutes =
  | { readonly from: 'stay'; readonly minutes: number }
  | { readonly from: 'poi'; readonly poi_id: string; readonly minutes: number }
  | { readonly from: 'day_route'; readonly day_id: string; readonly minutes: number };

/** The search filter (the same shape as the planning contract's `SearchFilter`). */
export interface SearchFilter {
  readonly text?: string;
  readonly categories?: readonly PoiCategory[];
  readonly meal?: SearchMeal;
  readonly attributes?: readonly SearchAttribute[];
  readonly open_past?: string;
  readonly max_minutes?: MaxMinutes;
  readonly exclude_day_ids?: readonly string[];
  readonly price_max?: number;
}

export type SearchChip =
  | { readonly code: 'category'; readonly params: { readonly category: PoiCategory } }
  | { readonly code: 'meal'; readonly params: { readonly meal: SearchMeal } }
  | { readonly code: 'attribute'; readonly params: { readonly attribute: SearchAttribute } }
  | { readonly code: 'open_past'; readonly params: { readonly time: string } }
  | { readonly code: 'max_minutes'; readonly params: MaxMinutes }
  | { readonly code: 'exclude_days'; readonly params: { readonly day_ids: readonly string[] } }
  | { readonly code: 'price_max'; readonly params: { readonly level: number } };

/**
 * Why days were left out, worked out by code from the digest (never by the model): the line under
 * the chips is a template on it ("Wednesday's already Locavore, so I looked at your other nights.").
 */
export interface ExcludeReason {
  readonly code: ExcludeReasonCode;
  readonly params: { readonly day_ids: readonly string[]; readonly stable_id?: string };
}

export interface SearchParseResult {
  readonly filters: SearchFilter;
  readonly chips: readonly SearchChip[];
  readonly exclude_reason?: ExcludeReason;
}
