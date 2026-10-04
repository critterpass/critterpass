/**
 * The `search-parse` eval suite (`pnpm --filter @cp/ai eval search-parse`): plain-words questions
 * in English and Vietnamese (cases.yaml) over four trips (trips.yaml) run through the real
 * `parseSearch` (prompt, gateway, validator); only DeepSeek's network boundary replays
 * (`fixtures/<id>.json`). A case passes when the filters hold what it grades, with day and place
 * ids mapped back to the digest's refs. Seeded cases grade the validator on an inline slip. A live
 * run prints the p50 and p95 latency of the parse call.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEARCH_MEALS, WEEKDAYS } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  checkSearchParseReply,
  dayRef,
  foldText,
  parseSearch,
  placeRef,
  type SearchParseDigest,
  type SearchParseOutcome,
} from '../../src/routes/search-parse';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { caseReport, percentile, recordedModel, suiteReport } from './recorded-model';

export const SEARCH_PARSE_SUITE = 'search-parse';

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const FIXTURES = here('./fixtures/');

const tripSchema = z.object({
  destination: z.string(),
  stay_name: z.string().nullable(),
  guide_name: z.string(),
  days: z.array(
    z.object({
      id: z.string(),
      date: z.string(),
      weekday: z.enum(WEEKDAYS),
      meals: z
        .array(z.object({ meal: z.enum(SEARCH_MEALS), title: z.string(), stable_id: z.string() }))
        .default([]),
      full: z.boolean().default(false),
      travel: z.boolean().default(false),
    }),
  ),
  places: z.array(z.object({ id: z.string(), name: z.string() })),
});

const nearSchema = z.union([
  z.literal('none'),
  z.object({
    from: z.enum(['stay', 'poi', 'day_route']),
    ref: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
]);

const caseSchema = z.object({
  id: z.string().regex(/^sp-\d{2}$/u),
  trip: z.string(),
  q: z.string(),
  description: z.string().optional(),
  expect: z
    .object({
      meal: z.string().optional(),
      categories: z.array(z.string()).optional(),
      attrs: z.array(z.string()).optional(),
      no_attrs: z.array(z.string()).optional(),
      cheap: z.boolean().optional(),
      open_past: z.string().optional(),
      near: nearSchema.optional(),
      exclude: z.array(z.string()).optional(),
      reason: z.string().optional(),
      text: z.array(z.string()).optional(),
      inert: z.boolean().optional(),
    })
    .default({}),
  seeded: z.boolean().default(false),
  reply: z.unknown().optional(),
});
type SearchParseCase = z.infer<typeof caseSchema>;

export interface SearchParseSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadSearchParseTrips(): Record<string, SearchParseDigest> {
  const raw = z
    .record(z.string(), tripSchema)
    .parse(parse(readFileSync(here('./trips.yaml'), 'utf8')) as unknown);
  return Object.fromEntries(
    Object.entries(raw).map(([key, trip]) => [
      key,
      {
        destination: trip.destination,
        stayName: trip.stay_name,
        guideName: trip.guide_name,
        days: trip.days.map((day) => ({
          id: day.id,
          date: day.date,
          weekday: day.weekday,
          meals: day.meals.map((m) => ({ meal: m.meal, title: m.title, stableId: m.stable_id })),
          full: day.full,
          travel: day.travel,
        })),
        places: trip.places,
      },
    ]),
  );
}

export function loadSearchParseCases(): SearchParseCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(here('./cases.yaml'), 'utf8')) as unknown);
}

/** Grades one outcome; ids are compared as the digest's refs. */
export function gradeSearchParse(
  c: SearchParseCase,
  digest: SearchParseDigest,
  outcome: SearchParseOutcome,
): string[] {
  if (c.seeded) return outcome.fallbackUsed ? [] : ['slip accepted'];
  const failures: string[] = [];
  const f = outcome.result.filters;
  const e = c.expect;
  const dayRefOf = (id: string) => dayRef(digest.days.findIndex((day) => day.id === id));
  const excluded = (f.exclude_day_ids ?? []).map(dayRefOf).sort();
  if (e.inert === true) {
    const extra = Object.keys(f).filter((key) => key !== 'text');
    if (extra.length > 0) failures.push(`expected no filter, got ${extra.join(', ')}`);
  }
  if (e.meal !== undefined && f.meal !== e.meal)
    failures.push(`meal ${f.meal}, expected ${e.meal}`);
  for (const category of e.categories ?? []) {
    if (!(f.categories ?? []).some((value) => value === category)) failures.push(`no ${category}`);
  }
  for (const attribute of e.attrs ?? []) {
    if (!(f.attributes ?? []).some((value) => value === attribute))
      failures.push(`no ${attribute}`);
  }
  for (const attribute of e.no_attrs ?? []) {
    if ((f.attributes ?? []).some((value) => value === attribute)) failures.push(`${attribute}`);
  }
  if (e.cheap === true && !(f.attributes ?? []).includes('cheap') && f.price_max !== 1) {
    failures.push('not cheap');
  }
  if (e.open_past !== undefined) {
    const want = e.open_past === 'none' ? undefined : e.open_past;
    if (f.open_past !== want) failures.push(`open_past ${f.open_past}, expected ${e.open_past}`);
  }
  if (e.near !== undefined) failures.push(...gradeNear(e.near, f.max_minutes, digest));
  if (e.exclude !== undefined && excluded.join(',') !== [...e.exclude].sort().join(',')) {
    failures.push(`excluded [${excluded.join(',')}], expected [${e.exclude.join(',')}]`);
  }
  if (e.reason !== undefined && outcome.result.exclude_reason?.code !== e.reason) {
    failures.push(`reason ${outcome.result.exclude_reason?.code}, expected ${e.reason}`);
  }
  const text = foldText(f.text ?? '');
  for (const word of e.text ?? []) if (!text.includes(word)) failures.push(`text lacks "${word}"`);
  return failures;
}

function gradeNear(
  want: z.infer<typeof nearSchema>,
  got: SearchParseOutcome['result']['filters']['max_minutes'],
  digest: SearchParseDigest,
): string[] {
  if (want === 'none') return got === undefined ? [] : [`near ${got.from}, expected none`];
  if (got === undefined) return [`no near, expected ${want.from}`];
  const failures: string[] = [];
  if (got.from !== want.from) failures.push(`near ${got.from}, expected ${want.from}`);
  const ref =
    got.from === 'poi'
      ? placeRef(digest.places.findIndex((place) => place.id === got.poi_id))
      : got.from === 'day_route'
        ? dayRef(digest.days.findIndex((day) => day.id === got.day_id))
        : undefined;
  if (want.ref !== undefined && ref !== want.ref)
    failures.push(`near ${ref}, expected ${want.ref}`);
  if (want.min !== undefined && got.minutes < want.min) failures.push(`${got.minutes} min`);
  if (want.max !== undefined && got.minutes > want.max) failures.push(`${got.minutes} min`);
  return failures;
}

async function run(
  c: SearchParseCase,
  digest: SearchParseDigest,
  options: SearchParseSuiteOptions,
): Promise<{ outcome: SearchParseOutcome; latencyMs: number | null }> {
  if (c.seeded) {
    const check = checkSearchParseReply(c.reply, c.q, digest);
    const outcome: SearchParseOutcome = check.ok
      ? { result: check.result, fallbackUsed: false }
      : {
          result: { filters: { text: c.q }, chips: [] },
          fallbackUsed: true,
          rejected: check.reason,
        };
    return { outcome, latencyMs: null };
  }
  const model = recordedModel(resolve(FIXTURES, `${c.id}.json`), options);
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: model.fetch,
    maxAttempts: options.mode === 'replay' ? 1 : 3,
  });
  const outcome = await parseSearch(gateway, { question: c.q, digest });
  model.finish();
  return { outcome, latencyMs: model.latencyMs() };
}

export async function runSearchParseSuite(
  options: SearchParseSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const trips = loadSearchParseTrips();
  const cases = [];
  const latencies: number[] = [];
  for (const c of loadSearchParseCases()) {
    const digest = trips[c.trip];
    if (digest === undefined) throw new Error(`${c.id}: unknown trip ${c.trip}`);
    const { outcome, latencyMs } = await run(c, digest, options);
    if (latencyMs !== null) latencies.push(latencyMs);
    const output = outcome.fallbackUsed
      ? `fallback (${outcome.rejected})`
      : JSON.stringify(outcome.result.filters);
    cases.push(
      caseReport(
        SEARCH_PARSE_SUITE,
        `${c.id}: ${c.description ?? c.q}`,
        gradeSearchParse(c, digest, outcome),
        output,
      ),
    );
  }
  if (options.mode === 'live') {
    console.log(
      `  search.parse latency p50 ${percentile(latencies, 50)} ms, p95 ${percentile(latencies, 95)} ms (n=${latencies.length})`,
    );
  }
  return suiteReport(SEARCH_PARSE_SUITE, options.mode, threshold, cases);
}
