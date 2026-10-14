/**
 * Estimates for a popular place, written with its profile: visit length, good times of day, busy
 * windows, the entry fee, up to three tips and what to wear or bring. The model may lean on the
 * pages or on what it knows of places like this; each field names its page and a quote when one
 * states it. Code decides the basis (`cited` only for a quote found on its page, never for a fee
 * or dress rule from a social page), Jev types the closed fields (visit bucket, times of day, busy
 * level per window), and a number is kept only in the fee and the visit length.
 */
import {
  BUSY_DAYS,
  BUSY_LEVELS,
  decisionBand,
  estimateBasis,
  MAX_BUSY_WINDOWS,
  MAX_ESTIMATE_TIPS,
  PLACE_BEST_TIMES,
  VISIT_BUCKET_KEYS,
  VISIT_BUCKETS,
  type BusyLevel,
  type BusyWindow,
  type EstimateField,
  type FactLikeField,
  type PlaceEstimates,
  type VisitBucket,
} from '@cp/domain';
import { z } from 'zod';

import type { DecisionClient } from '../../decide/client';
import { choice, noul, type ChoiceQuestion, type NoulQuestion } from '../../decide/questions';
import { isBlockedUrl } from '../../tools/blocked-domains';
import type { UsageContext } from '../../usage';
import { amountsIn } from '../facts-research/validate';
import { squash } from '../link-extract/validate';
import { PLACE_LABELS_ROUTE } from './labels';
import type { ProfileLocale, ProfilePage } from './prompt';

const cite = { source_url: { type: ['string', 'null'] }, quote: { type: ['string', 'null'] } };

const lineSchema = (locales: readonly ProfileLocale[], max: number) => ({
  type: 'object',
  additionalProperties: false,
  required: [...locales, 'source_url', 'quote'],
  properties: {
    ...Object.fromEntries(locales.map((l) => [l, { type: 'string', maxLength: max }])),
    ...cite,
  },
});

/** The `estimates` property of the profile reply's JSON schema. */
export function estimatesFormat(locales: readonly ProfileLocale[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'visit',
      'best_time',
      'busy',
      'busy_source_url',
      'busy_quote',
      'fee',
      'tips',
      'dress',
    ],
    properties: {
      visit: lineSchema(['en'], 80),
      best_time: lineSchema(['en'], 80),
      busy: {
        type: 'array',
        maxItems: MAX_BUSY_WINDOWS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['days', 'from', 'to', 'note'],
          properties: {
            days: { type: 'string', enum: [...BUSY_DAYS] },
            from: { type: 'integer', minimum: 0, maximum: 23 },
            to: { type: 'integer', minimum: 1, maximum: 24 },
            note: { type: 'string', maxLength: 80 },
          },
        },
      },
      busy_source_url: { type: ['string', 'null'] },
      busy_quote: { type: ['string', 'null'] },
      fee: { anyOf: [lineSchema(locales, 60), { type: 'null' }] },
      tips: { type: 'array', maxItems: MAX_ESTIMATE_TIPS, items: lineSchema(locales, 100) },
      dress: { anyOf: [lineSchema(locales, 80), { type: 'null' }] },
    },
  };
}

export const ESTIMATE_RULES = [
  '# Estimates (this place is one of the most visited in its town)',
  'estimates: what a group needs to plan the visit. Use the pages first; where they say nothing,',
  'give your best estimate from what places like this are usually like. Never invent a quote.',
  '- visit.en: how long a typical visit takes, a short phrase ("About two hours with the gardens").',
  '- best_time.en: when to go and why, a short phrase.',
  '- busy: up to 5 windows when it gets busy or stays quiet: days (every_day, weekdays, weekends),',
  '  from and to (local hours 0–24, to after from), note (who comes then, "tour buses", "locals',
  '  after work"). Leave it empty when you cannot tell.',
  '- fee: one adult ticket as the page writes it ("80.000 VND", "Free"), or null when unknown.',
  '- tips: up to 3 short tips a group would thank you for (queues, the best spot, cash, shoes).',
  '- dress: what to wear or bring, or null.',
  'Each field gives source_url and quote: a page URL from the data and a sentence copied exactly',
  'from it that states the field, or null for both when no page states it. Numbers belong only in',
  'visit and fee.',
].join('\n');

const citeSchema = { source_url: z.string().nullable(), quote: z.string().nullable() };
const rawLine = z.object({ en: z.string(), vi: z.string().optional(), ...citeSchema });

export const rawEstimatesSchema = z.object({
  visit: rawLine,
  best_time: rawLine,
  busy: z
    .array(
      z.object({
        days: z.enum(BUSY_DAYS),
        from: z.number().int(),
        to: z.number().int(),
        note: z.string(),
      }),
    )
    .max(12),
  busy_source_url: z.string().nullable(),
  busy_quote: z.string().nullable(),
  fee: rawLine.nullable(),
  tips: z.array(rawLine).max(6),
  dress: rawLine.nullable(),
});
export type RawEstimates = z.infer<typeof rawEstimatesSchema>;

/** The checked fields before Jev types the closed ones. */
export interface CheckedEstimates {
  readonly visit: { readonly text: string; readonly basis: CitedOr };
  readonly bestTime: { readonly text: string; readonly basis: CitedOr };
  readonly busy: {
    readonly windows: readonly Omit<BusyWindow, 'level'>[];
    readonly notes: readonly string[];
    readonly basis: CitedOr;
  };
  readonly fee?: EstimateField<Record<string, string>>;
  readonly tips: readonly EstimateField<Record<string, string>>[];
  readonly dress?: EstimateField<Record<string, string>>;
  /** Field names dropped and why (for the run's record). */
  readonly dropped: readonly { readonly field: string; readonly reason: string }[];
}

interface CitedOr {
  readonly basis: 'cited' | 'estimate';
  readonly source?: string;
}

const DIGIT = /\d/u;

/** Whether `quote` is on the page `url` (a known page, not a blocked site, a real sentence). */
export function quoteOnPage(
  url: string | null,
  quote: string | null,
  pages: readonly ProfilePage[],
): boolean {
  if (url === null || quote === null || isBlockedUrl(url)) return false;
  const squashed = squash(quote);
  if (squashed.length < 8) return false;
  return pages.some((p) => p.url === url && squash(`${p.title}\n${p.text}`).includes(squashed));
}

function basisOf(
  kind: FactLikeField | 'other',
  url: string | null,
  quote: string | null,
  pages: readonly ProfilePage[],
): CitedOr {
  const basis = estimateBasis(kind, url, quoteOnPage(url, quote, pages));
  return basis === 'cited' && url !== null ? { basis, source: url } : { basis: 'estimate' };
}

/**
 * Checks the model's estimates against the pages: bases set by code, windows kept only when they
 * end after they start, every language present, and tips and dress lines with a number dropped
 * (numbers belong only in the fee and the visit length).
 */
export function checkEstimates(
  raw: unknown,
  pages: readonly ProfilePage[],
  locales: readonly ProfileLocale[],
): CheckedEstimates | null {
  const parsed = rawEstimatesSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const dropped: { field: string; reason: string }[] = [];
  const lines = (line: z.infer<typeof rawLine>, field: string, kind: FactLikeField | 'other') => {
    const value = Object.fromEntries(locales.map((l) => [l, (line[l] ?? '').trim()]));
    if (Object.values(value).some((text) => text === '')) {
      dropped.push({ field, reason: 'missing_language' });
      return undefined;
    }
    if (kind !== 'fee' && Object.values(value).some((text) => DIGIT.test(text))) {
      dropped.push({ field, reason: 'number_outside_fee' });
      return undefined;
    }
    const basis = basisOf(kind, line.source_url, line.quote, pages);
    // A cited fee states its amount in the quote; otherwise the amount is the model's estimate.
    const quoted = amountsIn(line.quote ?? '');
    const amountHolds = [...amountsIn(line.en)].every((amount) => quoted.has(amount));
    if (kind === 'fee' && basis.basis === 'cited' && !amountHolds) {
      return { value, basis: 'estimate' as const };
    }
    return { value, ...basis };
  };
  const windows = r.busy
    .filter((w) => w.from >= 0 && w.from <= 23 && w.to > w.from && w.to <= 24)
    .slice(0, MAX_BUSY_WINDOWS);
  const fee = r.fee === null ? undefined : lines(r.fee, 'fee', 'fee');
  const dress = r.dress === null ? undefined : lines(r.dress, 'dress', 'dress');
  const tips = r.tips
    .slice(0, MAX_ESTIMATE_TIPS)
    .map((tip, i) => lines(tip, `tips.${i}`, 'other'))
    .filter((tip) => tip !== undefined);
  return {
    visit: {
      text: r.visit.en.trim(),
      basis: basisOf('other', r.visit.source_url, r.visit.quote, pages),
    },
    bestTime: {
      text: DIGIT.test(r.best_time.en) ? '' : r.best_time.en.trim(),
      basis: basisOf('other', r.best_time.source_url, r.best_time.quote, pages),
    },
    busy: {
      windows: windows.map(({ days, from, to }) => ({ days, from, to })),
      notes: windows.map((w) => w.note),
      basis: basisOf('other', r.busy_source_url, r.busy_quote, pages),
    },
    ...(fee === undefined ? {} : { fee }),
    tips,
    ...(dress === undefined ? {} : { dress }),
    dropped,
  };
}

export function estimateQuestions(windows: number) {
  const visit: ChoiceQuestion<VisitBucket> = choice(
    'How long does a typical visit take, from the description?',
    Object.fromEntries(
      VISIT_BUCKET_KEYS.map((key) => [
        key,
        `${VISIT_BUCKETS[key].min}–${VISIT_BUCKETS[key].max} minutes`,
      ]),
    ) as Record<VisitBucket, string>,
  );
  const times = Object.fromEntries(
    PLACE_BEST_TIMES.map((t) => [
      `best_${t}`,
      noul(`Is the ${t.replace('_', ' ')} a good time to visit, from the description?`),
    ]),
  ) as Record<`best_${(typeof PLACE_BEST_TIMES)[number]}`, NoulQuestion>;
  const busy = Object.fromEntries(
    Array.from({ length: windows }, (_, i) => [
      `busy_${i}`,
      choice(`How busy is window ${i} (busy_windows[${i}])?`, {
        quiet: 'few people, easy to move around',
        moderate: 'steady visitors, some waiting',
        busy: 'crowded, queues or tour groups',
      }),
    ]),
  ) as Record<`busy_${number}`, ChoiceQuestion<BusyLevel>>;
  return { visit, ...times, ...busy };
}

/** A cited-or-estimate field with `source` only when there is one. */
const withBasis = <T>(value: T, b: CitedOr): EstimateField<T> =>
  b.source === undefined ? { value, basis: b.basis } : { value, basis: b.basis, source: b.source };

/**
 * Jev types the closed fields from the checked notes; an answer under the confidence floor leaves
 * the field out (a window under the floor is dropped). Returns the stored estimates.
 */
export async function typeEstimates(
  decisions: Pick<DecisionClient, 'decide'>,
  place: { readonly name: string; readonly category: string },
  checked: CheckedEstimates,
  usage: UsageContext = {},
): Promise<{ estimates: PlaceEstimates; costMicros: number }> {
  const decision = await decisions.decide(
    PLACE_LABELS_ROUTE,
    {
      state: {
        name: place.name,
        category: place.category,
        visit: checked.visit.text,
        best_time: checked.bestTime.text,
        busy_windows: checked.busy.windows.map((w, i) => ({
          ...w,
          note: checked.busy.notes[i] ?? '',
        })),
      },
      questions: estimateQuestions(checked.busy.windows.length),
    },
    usage,
  );
  const floor = decisionBand(PLACE_LABELS_ROUTE, decision.answered_by).minConfidence;
  const answers = decision.answers as unknown as Record<
    string,
    { choice?: string; confidence: number; noul?: number }
  >;
  const visit = answers['visit'];
  const bestTimes = PLACE_BEST_TIMES.filter((t) => (answers[`best_${t}`]?.noul ?? 0) >= 0.5);
  const windows: BusyWindow[] = [];
  for (const [i, w] of checked.busy.windows.entries()) {
    const level = answers[`busy_${i}`];
    if (level === undefined || level.confidence < floor) continue;
    if (!(BUSY_LEVELS as readonly string[]).includes(level.choice ?? '')) continue;
    windows.push({ ...w, level: level.choice as BusyLevel });
  }
  const bucket =
    visit !== undefined && visit.confidence >= floor && checked.visit.text !== ''
      ? (visit.choice as VisitBucket)
      : null;
  const estimates: PlaceEstimates = {
    ...(bucket === null
      ? {}
      : {
          visit: withBasis({ bucket, minutes: VISIT_BUCKETS[bucket].minutes }, checked.visit.basis),
        }),
    ...(bestTimes.length === 0 || checked.bestTime.text === ''
      ? {}
      : { best_times: withBasis(bestTimes, checked.bestTime.basis) }),
    ...(windows.length === 0 ? {} : { busy: withBasis(windows, checked.busy.basis) }),
    ...(checked.fee === undefined ? {} : { fee: checked.fee }),
    tips: [...checked.tips],
    ...(checked.dress === undefined ? {} : { dress: checked.dress }),
  };
  return { estimates, costMicros: decision.costMicros };
}
