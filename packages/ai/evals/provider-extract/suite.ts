/**
 * The `provider-extract` eval suite: invented driver
 * and guide messages as travellers share them (fixtures/driver-messages.yaml: WhatsApp and
 * Facebook replies, links, contact cards, six languages, local price shorthand, two drivers in one
 * message, spam and prompt injection) run through the real `extractProvider` (prompt, gateway,
 * the span and phone checks); only DeepSeek's network boundary replays (`recordings/<id>.json`).
 *
 * A case is graded on what the driver card holds: name, phone, languages, car and seats, the
 * price (amount, a range's top end, currency, unit, hours, whether it is a rate per person or per
 * hour; a day and a block of hours are one reading when the hours are stated), what it includes,
 * overtime per hour (and the minutes the driver priced it by), the licence, and the area.
 * A field the message does not state must come back empty, never guessed, and a price is only ever
 * a figure the driver wrote: where the fixture says `ask`, the card must hold no price, only his
 * words to ask him about. `party` is the size of the crew the message was shared into, which picks
 * between prices by group size. What the fixture file describes beyond the card is not graded:
 * `role` and `years` (the card has no such lines).
 *
 * A case the file marks `render` is a screenshot: it goes in as the screenshot's text, and `crop`
 * cuts that text where the image is cut (above the phone number), so the number must not come
 * back. `expected_many` passes when the card is one of the drivers named, never a mix of two.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DriverCard, ParsedIntake } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { extractProvider, nothingRead } from '../../src/routes/provider-extract';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { caseReport, recordedModel, suiteReport } from '../search-parse/recorded-model';

export const PROVIDER_EXTRACT_SUITE = 'provider-extract';

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));

/** The trip a message was shared into: its currency and calling code. */
const DESTINATIONS: Readonly<Record<string, { currency: string; callingCode: string }>> = {
  bali: { currency: 'IDR', callingCode: '62' },
  kyoto: { currency: 'JPY', callingCode: '81' },
  iceland: { currency: 'ISK', callingCode: '354' },
  'mexico-city': { currency: 'MXN', callingCode: '52' },
  lisbon: { currency: 'EUR', callingCode: '351' },
  cusco: { currency: 'PEN', callingCode: '51' },
  'ha-giang': { currency: 'VND', callingCode: '84' },
};
const MINOR_PER_MAJOR: Readonly<Record<string, number>> = {
  IDR: 100,
  JPY: 1,
  ISK: 1,
  VND: 1,
  USD: 100,
  EUR: 100,
  MXN: 100,
  PEN: 100,
};

const include = z.enum(['yes', 'no', 'unknown']);
const expectedSchema = z.object({
  name: z.string().nullable(),
  role: z.string().nullable(),
  phone: z.string().nullable(),
  languages: z.array(z.string()),
  vehicle: z.object({ model: z.string().nullable(), seats: z.number().nullable() }).nullable(),
  price: z
    .object({
      amount: z.number(),
      amount_max: z.number().optional(),
      currency: z.string(),
      unit: z.enum(['day', 'hours', 'trip', 'person', 'hour']),
      hours: z.number().nullable(),
    })
    .nullable(),
  /** The message has price words but no one figure to quote: the card asks instead. */
  ask: z.boolean().optional(),
  includes: z.object({ fuel: include, parking: include, tolls: include, entry: include }),
  overtime: z
    .object({ amount: z.number(), currency: z.string(), per_minutes: z.number().optional() })
    .nullable(),
  areas: z.array(z.string()),
  years: z.number().nullable(),
  licence_shown: z.enum(['yes', 'unknown']),
});
type Expected = z.infer<typeof expectedSchema>;

const caseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/u),
    lang: z.string(),
    destination: z.string(),
    source: z.enum(['whatsapp', 'facebook_comment', 'facebook_post', 'link', 'vcard']),
    render: z.enum(['whatsapp_bubble', 'facebook_comment']).optional(),
    crop: z.enum(['phone', 'price']).optional(),
    party: z.number().int().min(1).optional(),
    message: z.string().min(1),
    expected: z.union([z.literal('none'), expectedSchema]).optional(),
    expected_many: z.array(expectedSchema).min(2).optional(),
    expected_after_crop: expectedSchema.optional(),
    notes: z.string().optional(),
  })
  .refine(
    (c) =>
      [c.expected, c.expected_many, c.expected_after_crop].filter((e) => e !== undefined).length ===
      1,
    'one of expected, expected_many, expected_after_crop',
  );
export type ProviderExtractCase = z.infer<typeof caseSchema>;

export function loadProviderExtractCases(): ProviderExtractCase[] {
  const file = here('./fixtures/driver-messages.yaml');
  return z.array(caseSchema).parse(parse(readFileSync(file, 'utf8')) as unknown);
}

const PHONE = /\+?\d[\d\s().-]{6,}\d/u;

/** The text the route is given: a screenshot cropped above the number ends before it. */
export function sharedText(c: ProviderExtractCase): string {
  if (c.crop !== 'phone') return c.message;
  const at = c.message.search(PHONE);
  return at < 0 ? c.message : c.message.slice(0, at).trimEnd();
}

const kindOf = (c: ProviderExtractCase) =>
  c.render !== undefined
    ? ('image' as const)
    : c.source === 'link'
      ? ('link' as const)
      : c.source === 'vcard'
        ? ('contact' as const)
        : ('text' as const);

const fold = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const within = (a: string, b: string) => fold(a).includes(fold(b)) || fold(b).includes(fold(a));

/** What the card gets wrong against one expected driver. */
export function gradeDriverCard(card: DriverCard, want: Expected): string[] {
  const failures: string[] = [];
  const differs = (field: string, got: unknown, wanted: unknown) => {
    if (got !== wanted)
      failures.push(`${field} ${JSON.stringify(got)}, want ${JSON.stringify(wanted)}`);
  };
  if (want.name === null) differs('name', card.name, null);
  else if (card.name === null || !within(card.name, want.name))
    differs('name', card.name, want.name);
  differs('phone', card.phone, want.phone);
  differs('languages', [...card.languages].sort().join(','), [...want.languages].sort().join(','));

  const model = want.vehicle?.model ?? null;
  if (want.vehicle === null) differs('car', card.car, null);
  // The message writes "Avanza" where the fixture says "Toyota Avanza": the model word decides.
  else if (
    model !== null &&
    (card.car === null || !within(card.car, model.split(' ').at(-1) ?? ''))
  )
    differs('car', card.car, model);
  differs('seats', card.seats, want.vehicle?.seats ?? null);

  differs('asks about the price', (card.price_ask ?? null) !== null, want.ask === true);
  if (want.price === null) {
    differs('price', card.price_minor, null);
  } else {
    const per = MINOR_PER_MAJOR[want.price.currency] ?? 100;
    differs('price', card.price_minor, Math.round(want.price.amount * per));
    differs(
      'price top end',
      card.price_max_minor ?? null,
      want.price.amount_max === undefined ? null : Math.round(want.price.amount_max * per),
    );
    differs('currency', card.currency, want.price.currency);
    differs(
      'price per',
      card.price_per ?? null,
      want.price.unit === 'person' || want.price.unit === 'hour' ? want.price.unit : null,
    );
    if (want.price.unit === 'day' || want.price.unit === 'hours' || want.price.unit === 'trip') {
      // "Full day, 10 hours" is a day and a block of 10 hours at once: with the hours stated and
      // read right, either unit names the same terms.
      const sameBlock =
        want.price.hours !== null &&
        card.included_hours === want.price.hours &&
        want.price.unit !== 'trip' &&
        card.price_unit !== 'trip';
      if (!sameBlock) differs('price unit', card.price_unit, want.price.unit);
      differs('hours', card.included_hours, want.price.hours);
    }
  }
  for (const key of ['fuel', 'parking', 'tolls', 'entry'] as const) {
    differs(`includes ${key}`, card.includes[key] ?? 'unknown', want.includes[key]);
  }
  if (want.overtime === null) differs('overtime', card.overtime_minor, null);
  else {
    const per = MINOR_PER_MAJOR[want.overtime.currency] ?? 100;
    differs('overtime', card.overtime_minor, Math.round(want.overtime.amount * per));
    differs(
      'overtime minutes',
      card.overtime_per_minutes ?? null,
      want.overtime.per_minutes ?? null,
    );
  }
  differs('licence', card.licence_shown === true ? 'yes' : 'unknown', want.licence_shown);
  if (card.area !== null && !want.areas.some((area) => within(card.area ?? '', area))) {
    differs('area', card.area, want.areas);
  }
  return failures;
}

export function gradeProviderExtract(
  c: ProviderExtractCase,
  result: ParsedIntake | null,
): string[] {
  if (c.expected === 'none') {
    return result === null || nothingRead(result) ? [] : ['read a driver where there is none'];
  }
  const wants =
    c.expected_many ??
    [c.expected_after_crop ?? c.expected].filter((want): want is Expected => want !== undefined);
  if (result === null) return ['nothing read'];
  return wants
    .map((want) => gradeDriverCard(result.card, want))
    .reduce((best, next) => (next.length < best.length ? next : best));
}

export interface ProviderExtractSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

async function run(
  c: ProviderExtractCase,
  options: ProviderExtractSuiteOptions,
): Promise<ParsedIntake | null> {
  const destination = DESTINATIONS[c.destination];
  if (destination === undefined) throw new Error(`${c.id}: unknown destination ${c.destination}`);
  const model = recordedModel(resolve(here('./recordings/'), `${c.id}.json`), options);
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: model.fetch,
    maxAttempts: options.mode === 'replay' ? 1 : 3,
  });
  const result = await extractProvider(gateway, {
    text: sharedText(c),
    kind: kindOf(c),
    currencyHint: destination.currency,
    callingCode: destination.callingCode,
    minorPerMajor: (currency) => MINOR_PER_MAJOR[currency] ?? null,
    partySize: c.party ?? null,
  });
  model.finish();
  return result;
}

export async function runProviderExtractSuite(
  options: ProviderExtractSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const reports = [];
  for (const c of loadProviderExtractCases()) {
    const result = await run(c, options);
    reports.push(
      caseReport(
        PROVIDER_EXTRACT_SUITE,
        `${c.id} [${c.lang}]`,
        gradeProviderExtract(c, result),
        JSON.stringify(result?.card ?? null),
      ),
    );
  }
  return suiteReport(PROVIDER_EXTRACT_SUITE, options.mode, threshold, reports);
}
