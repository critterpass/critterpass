/**
 * The `hours-research` eval suite (`pnpm --filter @cp/ai eval hours-research`): curated places
 * (cases.yaml) run through the real `researchPlaceHours` (query, web search screen, prompt, gateway,
 * validator); only Tavily's and DeepSeek's network boundaries replay (`fixtures/<id>.json`, both
 * recorded live together, with the recording time as the clock). A case passes when the place gets
 * the expected outcome: the expected weekly schedule from a cited page, or no proposal at all.
 * Seeded cases replay another case's recorded search with an inline model slip (an invented time,
 * an uncited page) that the validator must reject.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { needsHoursResearch } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  checkHoursReply,
  researchPlaceHours,
  searchPlaceHours,
  type HoursResearchPlace,
  type HoursResearchResult,
} from '../../src/routes/hours-research';
import { createTavilySearch } from '../../src/search';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const HOURS_RESEARCH_SUITE = 'hours-research';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases.yaml', import.meta.url));

const span = z.object({ start: z.string(), end: z.string() });
const caseSchema = z.object({
  id: z.string().regex(/^hours-\d{2}$/u),
  description: z.string(),
  place: z.object({
    name: z.string(),
    local_name: z.string().nullable().default(null),
    address: z.string().nullable().default(null),
    city: z.string(),
    category: z.string(),
  }),
  /** The schedule a proposal must carry; unset = no proposal expected. */
  weekly: z.record(z.string(), z.array(span)).optional(),
  /** The reason a declined case must give, when it matters. */
  reason: z.string().optional(),
  seeded: z.boolean().default(false),
  /** Seeded cases: the case whose recorded search they reuse, and the inline model reply. */
  search_from: z.string().optional(),
  reply: z.unknown().optional(),
});
type HoursCase = z.infer<typeof caseSchema>;

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

export interface HoursResearchSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly searchKey?: string;
  readonly record?: boolean;
}

export function loadHoursResearchCases(): HoursCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(CASES, 'utf8')) as unknown);
}

const fixturePath = (id: string) => resolve(FIXTURES, `${id}.json`);
const loadFixture = (id: string) => JSON.parse(readFileSync(fixturePath(id), 'utf8')) as Fixture;

function placeOf(c: HoursCase): HoursResearchPlace {
  return {
    name: c.place.name,
    localName: c.place.local_name,
    address: c.place.address,
    city: c.place.city,
    category: c.place.category,
  };
}

const replay =
  (recorded: Recorded): typeof fetch =>
  () =>
    Promise.resolve(jsonResponse(recorded.body, recorded.status));

/** Live fetch that keeps each response body for the recording. */
function capturing(into: { value?: Recorded }): typeof fetch {
  return async (url, init) => {
    const response = await fetch(url, init);
    into.value = { status: response.status, body: (await response.clone().json()) as unknown };
    return response;
  };
}

async function runSeeded(c: HoursCase): Promise<HoursResearchResult> {
  const fixture = loadFixture(c.search_from ?? '');
  const now = new Date(fixture.recorded_at);
  const search = createTavilySearch({ apiKey: 'replay', fetch: replay(fixture.search) });
  const results = await searchPlaceHours(search, placeOf(c), { now: () => now });
  const check = checkHoursReply(c.reply, results, now);
  return { ...check, costMicros: 0 };
}

async function run(c: HoursCase, options: HoursResearchSuiteOptions): Promise<HoursResearchResult> {
  if (c.seeded) return runSeeded(c);
  if (!needsHoursResearch(c.place.category)) {
    // Skipped before any call: a network call here fails the case.
    const none: typeof fetch = () => Promise.reject(new Error('no call expected'));
    const gateway = createGateway({ apiKey: 'none', fetch: none, maxAttempts: 1 });
    return researchPlaceHours(
      { gateway, search: createTavilySearch({ apiKey: 'none', fetch: none }) },
      placeOf(c),
    );
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
    return researchPlaceHours({ gateway, search, now: () => now }, placeOf(c));
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
  const result = await researchPlaceHours({ gateway, search, now: () => recordedAt }, placeOf(c));
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

const spansText = (spans: readonly { start: string; end: string }[] | undefined) =>
  (spans ?? []).map((s) => `${s.start}-${s.end}`).join(',');

export function gradeHoursResearch(c: HoursCase, result: HoursResearchResult): string[] {
  if (c.weekly === undefined) {
    if (result.ok) return [`proposed hours from ${result.proposal.sourceUrl}`];
    return c.reason !== undefined && result.reason !== c.reason
      ? [`declined as ${result.reason}, expected ${c.reason}`]
      : [];
  }
  if (!result.ok) return [`no proposal (${result.reason})`];
  const failures: string[] = [];
  const weekly = result.proposal.hours.weekly;
  for (const day of ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'] as const) {
    const want = spansText(c.weekly[day]);
    const got = spansText(weekly[day]);
    if (want !== got) failures.push(`${day}: ${got || 'closed'}, expected ${want || 'closed'}`);
  }
  return failures;
}

export async function runHoursResearchSuite(
  options: HoursResearchSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadHoursResearchCases()) {
    const result = await run(c, options);
    const failures = gradeHoursResearch(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'hours-research', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({
              type: 'hours-research',
              outcome: 'fail' as const,
              reason,
            })),
      output: result.ok
        ? `${result.proposal.sourceUrl} (${result.proposal.confidence}): ${JSON.stringify(result.proposal.hours.weekly)}`
        : result.reason,
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: HOURS_RESEARCH_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
