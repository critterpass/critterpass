/**
 * The `search.parse` reply and result. The model fills a closed vocabulary and names days and
 * places by the digest's short refs (`day1`, `place1`); code maps refs back to ids, so no id the
 * trip does not hold can come out. The result is the planning contract's `SearchParseResult`
 * (docs/api-contracts-planning.md, search): filters the screens show as chips, so a wrong guess is
 * one chip to remove.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { POI_CATEGORIES, SEARCH_ATTRIBUTES, SEARCH_MEALS } from '@cp/domain';
import { z } from 'zod';

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
