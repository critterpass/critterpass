/**
 * The driver card read from a shared message (route `provider.extract`): every field comes with the
 * exact words it was read from, and a field whose words are not in the message is dropped. A phone
 * number survives only when its digits are in the message, so the reader can never invent one.
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  DRIVER_FIELDS,
  EMPTY_DRIVER_CARD,
  type DriverCard,
  type DriverField,
  type IncludeValue,
  type ParsedIntake,
  type SourceSpan,
} from '@cp/domain';
import { z } from 'zod';

const quoted = { quote: { type: 'string' } } as const;
const nullable = (properties: Record<string, unknown>, required: readonly string[]) => ({
  type: ['object', 'null'],
  additionalProperties: false,
  required: [...required, 'quote'],
  properties: { ...properties, ...quoted },
});
const include = { type: 'string', enum: ['yes', 'no', 'unknown'] } as const;

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
      'price',
      'includes',
      'overtime',
      'licence_shown',
      'unreadable',
      'cut_off',
    ],
    properties: {
      name: nullable({ value: { type: 'string' } }, ['value']),
      phone: nullable({ value: { type: 'string' } }, ['value']),
      area: nullable({ value: { type: 'string' } }, ['value']),
      languages: nullable({ value: { type: 'array', items: { type: 'string' } } }, ['value']),
      car: nullable({ value: { type: 'string' }, seats: { type: ['integer', 'null'] } }, [
        'value',
        'seats',
      ]),
      price: nullable(
        {
          amount: { type: 'number' },
          currency: { type: ['string', 'null'] },
          unit: { type: 'string', enum: ['day', 'hours', 'trip'] },
          hours: { type: ['number', 'null'] },
        },
        ['amount', 'currency', 'unit', 'hours'],
      ),
      includes: {
        type: 'object',
        additionalProperties: false,
        required: ['fuel', 'parking', 'tolls', 'entry', 'quote'],
        properties: { fuel: include, parking: include, tolls: include, entry: include, ...quoted },
      },
      overtime: nullable({ amount: { type: 'number' } }, ['amount']),
      licence_shown: { type: ['boolean', 'null'] },
      unreadable: { type: 'array', items: { type: 'string' } },
      cut_off: { type: 'boolean' },
    },
  },
};

const withQuote = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, quote: z.string() }).nullable();
const includeValue = z.enum(['yes', 'no', 'unknown']);

export const providerExtractReplySchema = z.object({
  name: withQuote({ value: z.string() }),
  phone: withQuote({ value: z.string() }),
  area: withQuote({ value: z.string() }),
  languages: withQuote({ value: z.array(z.string()) }),
  car: withQuote({ value: z.string(), seats: z.number().int().nullable() }),
  price: withQuote({
    amount: z.number(),
    currency: z.string().nullable(),
    unit: z.enum(['day', 'hours', 'trip']),
    hours: z.number().nullable(),
  }),
  includes: z.object({
    fuel: includeValue,
    parking: includeValue,
    tolls: includeValue,
    entry: includeValue,
    quote: z.string(),
  }),
  overtime: withQuote({ amount: z.number() }),
  licence_shown: z.boolean().nullable(),
  unreadable: z.array(z.string()).max(6),
  cut_off: z.boolean(),
});
export type ProviderExtractReply = z.infer<typeof providerExtractReplySchema>;

export interface ValidateProviderOptions {
  /** Minor units per major unit for a currency (100 for USD, 1 for IDR); null = unknown code. */
  readonly minorPerMajor: (currency: string) => number | null;
  /** The trip's local currency, when the message names none ("650k"). */
  readonly currencyHint: string;
  /** The destination's calling code without `+` ("62"), for a local number ("0812…"). */
  readonly callingCode: string | null;
}

const fold = (text: string) => text.toLowerCase().replace(/\s+/gu, ' ');

/** Where `quote` is in `source` (case and spacing ignored), or null when it is not. */
export function spanOf(source: string, quote: string): SourceSpan | null {
  const needle = fold(quote.trim());
  if (needle.length === 0) return null;
  // Map folded offsets back to the source: fold keeps one char per source char except runs of space.
  const map: number[] = [];
  let folded = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] as string;
    if (/\s/u.test(ch)) {
      if (folded.endsWith(' ')) continue;
      folded += ' ';
    } else {
      folded += ch.toLowerCase();
    }
    map.push(i);
  }
  const at = folded.indexOf(needle);
  if (at < 0) return null;
  const end = map[at + needle.length - 1];
  return [map[at] as number, (end ?? source.length - 1) + 1];
}

const digits = (text: string) => text.replace(/\D/gu, '');

/** The number as E.164, only when its digits are in the quoted words of the message. */
export function verifiedPhone(value: string, quote: string, callingCode: string | null): string | null {
  const said = digits(quote);
  let e164 = digits(value);
  if (e164.length < 7) return null;
  if (value.trim().startsWith('0') || (!value.includes('+') && said.startsWith('0'))) {
    if (callingCode === null) return null;
    e164 = callingCode + e164.replace(/^0+/u, '');
  }
  const national = e164.slice(-9);
  if (!said.includes(national)) return null;
  return /^[1-9]\d{6,14}$/u.test(e164) ? `+${e164}` : null;
}

const toMinor = (amount: number, currency: string, options: ValidateProviderOptions) => {
  const per = options.minorPerMajor(currency);
  if (per === null || !Number.isFinite(amount) || amount <= 0) return null;
  const minor = Math.round(amount * per);
  return minor >= 1 && minor <= 100_000_000_000 ? minor : null;
};

/** The reply checked against the message: fields without their words in it are dropped. */
export function validateProviderReply(
  reply: ProviderExtractReply,
  source: string,
  options: ValidateProviderOptions,
): ParsedIntake {
  const card: { -readonly [K in keyof DriverCard]: DriverCard[K] } = {
    ...EMPTY_DRIVER_CARD,
    includes: {},
  };
  const spans: Partial<Record<DriverField, SourceSpan>> = {};
  const keep = (field: DriverField, quote: string): boolean => {
    const span = spanOf(source, quote);
    if (span === null) return false;
    spans[field] = span;
    return true;
  };
  if (reply.name !== null && reply.name.value.trim() !== '' && keep('name', reply.name.quote)) {
    card.name = reply.name.value.trim().slice(0, 120);
  }
  if (reply.phone !== null) {
    const phone = verifiedPhone(reply.phone.value, reply.phone.quote, options.callingCode);
    if (phone !== null && keep('phone', reply.phone.quote)) card.phone = phone;
  }
  if (reply.area !== null && spanOf(source, reply.area.quote) !== null) {
    card.area = reply.area.value.trim().slice(0, 80) || null;
  }
  if (reply.languages !== null && keep('languages', reply.languages.quote)) {
    card.languages = reply.languages.value
      .map((language) => language.trim())
      .filter((language) => language.length >= 2 && language.length <= 20)
      .slice(0, 8);
  }
  if (reply.car !== null && reply.car.value.trim() !== '' && keep('car', reply.car.quote)) {
    card.car = reply.car.value.trim().slice(0, 80);
    const seats = reply.car.seats;
    card.seats = seats !== null && seats >= 1 && seats <= 60 ? seats : null;
  }
  if (reply.price !== null && keep('price', reply.price.quote)) {
    const currency = (reply.price.currency ?? options.currencyHint).toUpperCase();
    const minor = toMinor(reply.price.amount, currency, options);
    if (minor !== null) {
      card.price_minor = minor;
      card.currency = currency;
      card.price_unit = reply.price.unit;
      const hours = reply.price.hours;
      card.included_hours = hours !== null && hours > 0 && hours <= 24 ? hours : null;
    } else {
      delete spans.price;
    }
  }
  const includes = reply.includes;
  const said = (value: IncludeValue) => value !== 'unknown';
  if ((['fuel', 'parking', 'tolls', 'entry'] as const).some((key) => said(includes[key]))) {
    if (keep('includes', includes.quote)) {
      for (const key of ['fuel', 'parking', 'tolls', 'entry'] as const) {
        if (said(includes[key])) card.includes[key] = includes[key];
      }
    }
  }
  if (reply.overtime !== null && card.currency !== null && keep('overtime', reply.overtime.quote)) {
    card.overtime_minor = toMinor(reply.overtime.amount, card.currency, options);
    if (card.overtime_minor === null) delete spans.overtime;
  }
  card.licence_shown = reply.licence_shown === true ? true : null;
  return {
    card,
    spans,
    unreadable: reply.unreadable.map((line) => line.slice(0, 160)).slice(0, 6),
    cut_off: reply.cut_off,
  };
}

/** True when the card has nothing a traveller could check (6c-3 instead of 6c-2). */
export function nothingRead(parsed: ParsedIntake): boolean {
  return DRIVER_FIELDS.every((field) => parsed.spans[field] === undefined);
}
