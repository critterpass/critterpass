/**
 * The `recap` eval suite (`pnpm --filter @cp/ai eval recap`): finished trips (cases/trips.yaml)
 * run through the real `writeRecapCopy` (prompt, gateway, number guard, tone rules, template
 * fallback); only DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when
 * the guide's own words came back (not the template) for every card and award, every number in
 * them is one the facts hold, nothing breaks the tone rules (no bodies, health, drinking, money
 * owed or lateness), no emoji, the must-say strings are there and nothing forbidden (planted
 * instructions in names, crew names) is repeated. Seeded cases (cases/seeded.yaml) grade the
 * validator on deliberate slips: the template must answer, in both modes.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AWARD_KINDS, RECAP_CARDS } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { personaIdSchema } from '../../src/persona/schema';
import {
  allowedRecapNumbers,
  recapCopyReplySchema,
  mergeRecapCopy,
  toneSlip,
  ungroundedRecapNumbers,
  validateRecapCopy,
  writeRecapCopy,
  type RecapCopyFacts,
  type RecapCopyInput,
  type RecapCopyResult,
} from '../../src/routes/recap';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const RECAP_SUITE = 'recap';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases/', import.meta.url));
const EMOJI = /\p{Extended_Pictographic}/u;

const awardSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  award: z.enum(AWARD_KINDS),
  metric: z.string(),
  value: z.number().int().min(0),
  evidence: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
});

const caseSchema = z.object({
  id: z.string().regex(/^recap-\d{2}$/u),
  description: z.string(),
  guide: personaIdSchema,
  cards: z.array(z.enum(RECAP_CARDS)).min(1),
  facts: z.custom<RecapCopyFacts>((value) => typeof value === 'object' && value !== null),
  awards: z.array(awardSchema),
  must: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
  seeded: z.boolean().default(false),
  reply: recapCopyReplySchema.optional(),
  expect_fallback: z.boolean().default(false),
  expect_reason: z.string().optional(),
});
type RecapCase = z.infer<typeof caseSchema>;

export interface RecapSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadRecapCases(): RecapCase[] {
  return readdirSync(CASES)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) =>
      z.array(caseSchema).parse(parse(readFileSync(resolve(CASES, file), 'utf8'))),
    );
}

function inputOf(c: RecapCase): RecapCopyInput {
  return { guide: c.guide, cards: c.cards, facts: c.facts, awards: c.awards };
}

function transport(c: RecapCase, options: RecapSuiteOptions): typeof fetch {
  const file = resolve(FIXTURES, `${c.id}.json`);
  if (options.mode === 'replay') {
    return () => {
      const { response } = JSON.parse(readFileSync(file, 'utf8')) as {
        response: { status: number; body: unknown };
      };
      return Promise.resolve(jsonResponse(response.body, response.status));
    };
  }
  return async (url, init) => {
    const response = await fetch(url, init);
    if (options.record === true) {
      const body = (await response.clone().json()) as unknown;
      mkdirSync(FIXTURES, { recursive: true });
      const source = `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`;
      writeFileSync(
        file,
        `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
      );
    }
    return response;
  };
}

async function run(c: RecapCase, options: RecapSuiteOptions): Promise<RecapCopyResult> {
  const input = inputOf(c);
  if (c.seeded)
    return mergeRecapCopy(validateRecapCopy(c.reply ?? { cards: {}, awards: [] }, input), input);
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(c, options),
    maxAttempts: 1,
  });
  return writeRecapCopy(gateway, input);
}

export function gradeRecap(c: RecapCase, result: RecapCopyResult): string[] {
  const failures: string[] = [];
  if (result.fallbackUsed !== c.expect_fallback) {
    failures.push(
      result.fallbackUsed ? `template answered (${result.rejected ?? 'unknown'})` : 'slip accepted',
    );
  }
  if (c.expect_reason !== undefined && !(result.rejected ?? '').startsWith(c.expect_reason)) {
    failures.push(`rejected for ${result.rejected ?? 'nothing'}, not ${c.expect_reason}`);
  }
  const allowed = allowedRecapNumbers(c.facts, c.awards);
  const lines: string[] = [];
  for (const card of c.cards) {
    const copy = result.cards[card];
    if (copy === undefined) {
      failures.push(`no ${card} card`);
      continue;
    }
    lines.push(...[copy.narration, copy.headline, copy.line].filter((t) => t !== undefined));
  }
  for (const award of result.awards) {
    lines.push(award.title, award.line);
    const slip = toneSlip(`${award.title} ${award.line}`);
    if (slip !== null) failures.push(`tone "${slip}" in ${award.user_id}`);
  }
  if (result.awards.length !== c.awards.length) failures.push(`${result.awards.length} awards`);
  for (const text of lines) {
    const loose = ungroundedRecapNumbers(text, allowed);
    if (loose.length > 0) failures.push(`ungrounded ${loose.join(', ')}`);
    if (EMOJI.test(text)) failures.push('emoji');
  }
  const all = lines.join('\n');
  for (const word of c.must) if (!all.includes(word)) failures.push(`no "${word}"`);
  const lower = all.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runRecapSuite(
  options: RecapSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadRecapCases()) {
    const result = await run(c, options);
    const failures = gradeRecap(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'recap', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'recap', outcome: 'fail' as const, reason })),
      output: [
        ...Object.entries(result.cards).map(([card, copy]) => `${card}: ${copy?.narration ?? ''}`),
        ...result.awards.map((award) => `${award.title}: ${award.line}`),
      ].join(' | '),
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: RECAP_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
