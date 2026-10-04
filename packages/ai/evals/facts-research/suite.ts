/**
 * The `facts-research` eval suite (`pnpm --filter @cp/ai eval facts-research`): curated places in
 * Bali, Kyoto and Đà Nẵng (cases.yaml) run through the real `researchPlaceFacts` (query, web
 * search screen, prompt, gateway, validator); only Tavily's and DeepSeek's network boundaries
 * replay (`fixtures/<id>.json`, recorded live together, with the recording time as the clock). A
 * case passes when the kept facts match what it expects and every kept fact's quote is on its
 * cited page. Seeded cases replay another case's recorded search with an inline model slip (a fee
 * the page never states, an uncited page, a made-up quote) that the validator must drop.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  amountsIn,
  checkFactsReply,
  researchPlaceFacts,
  searchPlaceFacts,
  type FactsResearchPlace,
  type FactsResearchResult,
} from '../../src/routes/facts-research';
import { createTavilySearch } from '../../src/search';
import type { EvalMode } from '../lib/provider';
import type { SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';
import { caseReport, suiteReport } from '../search-parse/recorded-model';

export const FACTS_RESEARCH_SUITE = 'facts-research';

const here = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const FIXTURES = here('./fixtures/');

const caseSchema = z.object({
  id: z.string().regex(/^facts-\d{2}$/u),
  description: z.string(),
  place: z.object({
    name: z.string(),
    local_name: z.string().nullable().default(null),
    address: z.string().nullable().default(null),
    city: z.string(),
    category: z.string(),
  }),
  expect: z
    .object({
      /** No proposal at all. */
      none: z.boolean().optional(),
      /** The entry fee's amount, `free`, or `none` for no fee kept. */
      entry: z.union([z.number(), z.literal('free'), z.literal('none')]).optional(),
      /** A word the kept dress line must hold, or `none`. */
      dress: z.string().optional(),
      /** Fact kinds that must have been dropped by the validator. */
      dropped: z.array(z.string()).default([]),
    })
    .default({ dropped: [] }),
  seeded: z.boolean().default(false),
  search_from: z.string().optional(),
  reply: z.unknown().optional(),
});
type FactsCase = z.infer<typeof caseSchema>;

interface Recorded {
  readonly status: number;
  readonly body: unknown;
}
interface Fixture {
  readonly source: string;
  readonly recorded_at: string;
  readonly search: Recorded;
  readonly model: Recorded;
}

export interface FactsResearchSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly searchKey?: string;
  readonly record?: boolean;
}

export function loadFactsResearchCases(): FactsCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(here('./cases.yaml'), 'utf8')) as unknown);
}

const fixturePath = (id: string) => resolve(FIXTURES, `${id}.json`);
const loadFixture = (id: string) => JSON.parse(readFileSync(fixturePath(id), 'utf8')) as Fixture;

const placeOf = (c: FactsCase): FactsResearchPlace => ({
  name: c.place.name,
  localName: c.place.local_name,
  address: c.place.address,
  city: c.place.city,
  category: c.place.category,
});

const replay =
  (recorded: Recorded): typeof fetch =>
  () =>
    Promise.resolve(jsonResponse(recorded.body, recorded.status));

function capturing(into: { value?: Recorded }): typeof fetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    into.value = { status: response.status, body: (await response.clone().json()) as unknown };
    return response;
  };
}

async function run(c: FactsCase, options: FactsResearchSuiteOptions): Promise<FactsResearchResult> {
  if (c.seeded) {
    const fixture = loadFixture(c.search_from ?? '');
    const now = new Date(fixture.recorded_at);
    const search = createTavilySearch({ apiKey: 'replay', fetch: replay(fixture.search) });
    const results = await searchPlaceFacts(search, placeOf(c), { now: () => now });
    return { ...checkFactsReply(c.reply, results, now), costMicros: 0 };
  }
  if (options.mode === 'replay') {
    const fixture = loadFixture(c.id);
    const now = new Date(fixture.recorded_at);
    const gateway = createGateway({
      apiKey: 'replay',
      fetch: replay(fixture.model),
      maxAttempts: 1,
    });
    const search = createTavilySearch({ apiKey: 'replay', fetch: replay(fixture.search) });
    return researchPlaceFacts({ gateway, search, now: () => now }, placeOf(c));
  }
  const searched: { value?: Recorded } = {};
  const answered: { value?: Recorded } = {};
  const gateway = createGateway({
    apiKey: options.apiKey ?? '',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: capturing(answered),
    maxAttempts: 3,
  });
  const search = createTavilySearch({
    apiKey: options.searchKey ?? '',
    fetch: capturing(searched),
    timeoutMs: 20_000,
  });
  const recordedAt = new Date();
  const result = await researchPlaceFacts({ gateway, search, now: () => recordedAt }, placeOf(c));
  if (options.record === true && searched.value !== undefined && answered.value !== undefined) {
    mkdirSync(FIXTURES, { recursive: true });
    const fixture: Fixture = {
      source: `Live recording from Tavily's search API and DeepSeek through its Anthropic-format API, ${recordedAt.toISOString().slice(0, 10)}.`,
      recorded_at: recordedAt.toISOString(),
      search: searched.value,
      model: answered.value,
    };
    writeFileSync(fixturePath(c.id), `${JSON.stringify(fixture, null, 2)}\n`);
  }
  return result;
}

export function gradeFactsResearch(c: FactsCase, result: FactsResearchResult): string[] {
  const want = c.expect;
  if (want.none === true) return result.ok ? ['proposed facts, expected none'] : [];
  if (!result.ok) {
    return want.entry === undefined || want.entry === 'none'
      ? []
      : [`no proposal (${result.reason})`];
  }
  const failures: string[] = [];
  const entry = result.proposal.entry;
  if (want.entry === 'none' && entry !== null) failures.push(`kept entry ${entry.value}`);
  if (want.entry === 'free' && !/free|mien phi/iu.test(entry?.value ?? '')) {
    failures.push(`entry ${entry?.value ?? 'none'}, expected free`);
  }
  if (typeof want.entry === 'number' && !amountsIn(entry?.value ?? '').has(want.entry)) {
    failures.push(`entry ${entry?.value ?? 'none'}, expected ${want.entry}`);
  }
  const dress = result.proposal.dress?.value.toLowerCase() ?? null;
  if (want.dress === 'none' && dress !== null) failures.push(`kept dress ${dress}`);
  if (want.dress !== undefined && want.dress !== 'none' && !(dress ?? '').includes(want.dress)) {
    failures.push(`dress ${dress ?? 'none'}, expected ${want.dress}`);
  }
  for (const kind of want.dropped) {
    if (!result.dropped.some((line) => line.startsWith(`${kind}:`))) failures.push(`kept ${kind}`);
  }
  return failures;
}

export async function runFactsResearchSuite(
  options: FactsResearchSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases = [];
  for (const c of loadFactsResearchCases()) {
    const result = await run(c, options);
    const p = result.ok ? result.proposal : null;
    const output = p
      ? `entry ${p.entry?.value ?? '-'} · dress ${p.dress?.value ?? '-'} · know ${p.knowBefore.map((k) => k.value).join(' / ')}${result.ok && result.dropped.length > 0 ? ` · dropped ${result.dropped.join(', ')}` : ''}`
      : result.ok
        ? ''
        : result.reason;
    cases.push(
      caseReport(
        FACTS_RESEARCH_SUITE,
        `${c.id}: ${c.description}`,
        gradeFactsResearch(c, result),
        output,
      ),
    );
  }
  return suiteReport(FACTS_RESEARCH_SUITE, options.mode, threshold, cases);
}
