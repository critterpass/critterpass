/**
 * The `briefing` eval suite (`pnpm --filter @cp/ai eval briefing`): 20 mornings across the guides
 * (cases.yaml) run through the real `writeBriefing` (prompt, gateway, validator, template
 * fallback); only DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when
 * the guide's own lines came back (not the template), at most three of them, every number grounded
 * in its candidate's facts, the expected candidates chosen, the must-say strings present and
 * nothing forbidden (planted instructions, private facts) repeated. Seeded cases grade the
 * validator on a deliberate slip: the template must answer, in both modes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { personaIdSchema } from '../../src/persona/schema';
import {
  briefingCandidateSchema,
  briefingReplySchema,
  MAX_BRIEFING_ITEMS,
  templateBriefing,
  ungroundedNumbers,
  validateBriefingReply,
  writeBriefing,
  type BriefingResult,
} from '../../src/routes/briefing';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const BRIEFING_SUITE = 'briefing';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases.yaml', import.meta.url));
const EMOJI = /\p{Extended_Pictographic}/u;

const caseSchema = z.object({
  id: z.string().regex(/^briefing-\d{2}$/u),
  description: z.string(),
  guide: personaIdSchema,
  local_date: z.iso.date(),
  candidates: z.array(briefingCandidateSchema).min(1),
  must: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
  expect_ids: z.array(z.string()).default([]),
  seeded: z.boolean().default(false),
  reply: briefingReplySchema.optional(),
  expect_fallback: z.boolean().default(false),
});
type BriefingCase = z.infer<typeof caseSchema>;

export interface BriefingSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadBriefingCases(): BriefingCase[] {
  const raw = parse(readFileSync(CASES, 'utf8')) as unknown;
  return z.array(caseSchema).parse(raw);
}

function transport(c: BriefingCase, options: BriefingSuiteOptions): typeof fetch {
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

async function run(c: BriefingCase, options: BriefingSuiteOptions): Promise<BriefingResult> {
  if (c.seeded) {
    const verdict = validateBriefingReply(c.reply ?? { items: [] }, c.candidates);
    return verdict.ok
      ? { lines: verdict.lines, fallbackUsed: false }
      : { lines: templateBriefing(c.candidates), fallbackUsed: true, rejected: verdict.reason };
  }
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(c, options),
    maxAttempts: 1,
  });
  return writeBriefing(gateway, {
    guide: c.guide,
    localDate: c.local_date,
    candidates: c.candidates,
  });
}

export function gradeBriefing(c: BriefingCase, result: BriefingResult): string[] {
  const failures: string[] = [];
  if (result.fallbackUsed !== c.expect_fallback) {
    failures.push(
      result.fallbackUsed ? `template answered (${result.rejected ?? 'unknown'})` : 'slip accepted',
    );
  }
  if (result.lines.length === 0) failures.push('no lines');
  if (result.lines.length > MAX_BRIEFING_ITEMS) failures.push(`${result.lines.length} lines`);
  const text = result.lines.map((line) => line.text).join('\n');
  for (const line of result.lines) {
    const loose = ungroundedNumbers(line.text, line.candidate);
    if (loose.length > 0) failures.push(`ungrounded ${loose.join(', ')}`);
    if (EMOJI.test(line.text)) failures.push('emoji');
  }
  const chosen = new Set(result.lines.map((line) => line.candidate.id));
  for (const id of c.expect_ids) if (!chosen.has(id)) failures.push(`${id} not chosen`);
  for (const word of c.must) if (!text.includes(word)) failures.push(`no "${word}"`);
  const lower = text.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runBriefingSuite(
  options: BriefingSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadBriefingCases()) {
    const result = await run(c, options);
    const failures = gradeBriefing(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'briefing', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'briefing', outcome: 'fail' as const, reason })),
      output: result.lines.map((line) => `${line.candidate.id}: ${line.text}`).join(' | '),
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: BRIEFING_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
