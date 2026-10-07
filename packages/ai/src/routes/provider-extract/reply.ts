/**
 * The shape the model answers the driver-card read in, and a forgiving reading of it: a field the
 * model got wrong (an object with a null value, a unit we do not know, a missing key) is that field
 * left unread, never the whole card thrown away.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const quote = { type: 'string' } as const;
const nullableObject = (properties: Record<string, unknown>) => ({
  type: ['object', 'null'],
  additionalProperties: false,
  required: [...Object.keys(properties), 'quote'],
  properties: { ...properties, quote },
});
const include = { type: 'string', enum: ['yes', 'no', 'unknown'] } as const;

export const PRICE_REPLY_UNITS = ['day', 'hours', 'trip'] as const;
export const PRICE_REPLY_BASES = ['group', 'person', 'hour'] as const;

const offer = {
  type: 'object',
  additionalProperties: false,
  required: [
    'amount',
    'amount_max',
    'currency',
    'unit',
    'per',
    'hours',
    'car',
    'seats',
    'from',
    'quote',
  ],
  properties: {
    amount: { type: 'number' },
    amount_max: { type: ['number', 'null'] },
    currency: { type: ['string', 'null'] },
    unit: { type: 'string', enum: PRICE_REPLY_UNITS },
    per: { type: 'string', enum: PRICE_REPLY_BASES },
    hours: { type: ['number', 'null'] },
    car: { type: ['string', 'null'] },
    seats: { type: ['integer', 'null'] },
    from: { type: 'boolean' },
    quote,
  },
} as const;

export const PROVIDER_EXTRACT_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'name',
      'phone',
      'area',
      'languages',
      'car',
      'prices',
      'includes',
      'overtime',
      'licence_shown',
      'unreadable',
      'cut_off',
    ],
    properties: {
      name: nullableObject({ value: { type: 'string' } }),
      phone: nullableObject({ value: { type: 'string' } }),
      area: nullableObject({ value: { type: 'string' } }),
      languages: nullableObject({ value: { type: 'array', items: { type: 'string' } } }),
      car: nullableObject({
        value: { type: ['string', 'null'] },
        seats: { type: ['integer', 'null'] },
      }),
      prices: { type: 'array', items: offer },
      includes: {
        type: 'object',
        additionalProperties: false,
        required: ['fuel', 'parking', 'tolls', 'entry', 'quote'],
        properties: { fuel: include, parking: include, tolls: include, entry: include, quote },
      },
      overtime: nullableObject({
        amount: { type: 'number' },
        currency: { type: ['string', 'null'] },
        per_minutes: { type: ['integer', 'null'] },
      }),
      licence_shown: { type: ['boolean', 'null'] },
      unreadable: { type: 'array', items: { type: 'string' } },
      cut_off: { type: 'boolean' },
    },
  },
};

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');
const optional = <T extends z.ZodType>(schema: T) =>
  schema.nullish().transform((value) => value ?? null);
/** A field read as null when the model left it out, answered null or answered it off-shape. */
const field = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object({ ...shape, quote: text })
    .nullish()
    .transform((value) => value ?? null)
    .catch(null);
const includeValue = z.enum(['yes', 'no', 'unknown']).catch('unknown');

/** One price as the model answered it; read one at a time so a bad one does not lose the others. */
export const priceOfferReplySchema = z.object({
  amount: z.number(),
  amount_max: optional(z.number()),
  currency: optional(z.string()),
  unit: z.enum(PRICE_REPLY_UNITS),
  per: z.enum(PRICE_REPLY_BASES).catch('group'),
  hours: optional(z.number()).catch(null),
  car: optional(z.string()).catch(null),
  seats: optional(z.number().int()).catch(null),
  from: z.boolean().catch(false),
  quote: z.string(),
});
export type PriceOfferReply = z.infer<typeof priceOfferReplySchema>;

export const providerExtractReplySchema = z.object({
  name: field({ value: optional(z.string()) }),
  phone: field({ value: optional(z.string()) }),
  area: field({ value: optional(z.string()) }),
  languages: field({ value: optional(z.array(z.string())) }),
  car: field({
    value: optional(z.string()),
    seats: optional(z.number().int()).catch(null),
  }),
  prices: z.array(z.unknown()).max(12).catch([]),
  includes: z
    .object({
      fuel: includeValue,
      parking: includeValue,
      tolls: includeValue,
      entry: includeValue,
      quote: text,
    })
    .catch({ fuel: 'unknown', parking: 'unknown', tolls: 'unknown', entry: 'unknown', quote: '' }),
  overtime: field({
    amount: z.number(),
    currency: optional(z.string()).catch(null),
    per_minutes: optional(z.number()).catch(null),
  }),
  licence_shown: z.boolean().nullable().catch(null),
  unreadable: z.array(z.string()).catch([]),
  cut_off: z.boolean().catch(false),
});
export type ProviderExtractReply = z.infer<typeof providerExtractReplySchema>;

/**
 * The model's answer as a reply, or null when it is not a driver-card answer at all (not an
 * object, or none of the card's lines in it).
 */
export function parseProviderReply(raw: unknown): ProviderExtractReply | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const answered = ['name', 'phone', 'prices', 'includes'].filter((key) => key in raw);
  if (answered.length < 2) return null;
  const reply = providerExtractReplySchema.safeParse(raw);
  return reply.success ? reply.data : null;
}
