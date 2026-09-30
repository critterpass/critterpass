/**
 * The `place-qna` eval suite (`pnpm --filter @cp/ai eval place-qna`): crew chats about a place
 * (place-qna.yaml) run through the real `summarisePlaceQna` (prompt, gateway, validator); only
 * DeepSeek's network boundary replays (`fixtures/<id>.json`). A case passes when a valid one-line
 * snippet came back citing a given message (the expected one when named), the must-say strings are
 * present and nothing planted in the chat (other formats, links, other places, prompt text) shows.
 * Seeded cases grade the validator on a deliberate slip: it must reject it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import {
  summarisePlaceQna,
  validatePlaceQna,
  type PlaceQnaInput,
  type PlaceQnaResult,
} from '../../src/routes/explore';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const PLACE_QNA_SUITE = 'place-qna';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./place-qna.yaml', import.meta.url));

const caseSchema = z.object({
  id: z.string().regex(/^place-qna-\d{2}$/u),
  description: z.string(),
  place: z.string(),
  messages: z
    .array(z.object({ id: z.string(), author: z.string(), at: z.string(), text: z.string() }))
    .min(1),
  must: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
  source: z.string().optional(),
  seeded: z.boolean().default(false),
  expect_ok: z.boolean().default(true),
  reply: z.unknown().optional(),
});
type PlaceQnaCase = z.infer<typeof caseSchema>;

export interface PlaceQnaSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadPlaceQnaCases(): PlaceQnaCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(CASES, 'utf8')) as unknown);
}

function transport(c: PlaceQnaCase, options: PlaceQnaSuiteOptions): typeof fetch {
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

function inputOf(c: PlaceQnaCase): PlaceQnaInput {
  return { placeName: c.place, messages: c.messages };
}

async function run(c: PlaceQnaCase, options: PlaceQnaSuiteOptions): Promise<PlaceQnaResult> {
  if (c.seeded) return validatePlaceQna(c.reply, inputOf(c));
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(c, options),
    maxAttempts: 1,
  });
  return summarisePlaceQna(gateway, inputOf(c));
}

export function gradePlaceQna(c: PlaceQnaCase, result: PlaceQnaResult): string[] {
  if (!result.ok) return c.expect_ok ? [`rejected (${result.reason})`] : [];
  if (!c.expect_ok) return ['slip accepted'];
  const failures: string[] = [];
  const text = result.snippet.text.toLowerCase();
  if (c.source !== undefined && result.snippet.sourceMessageId !== c.source) {
    failures.push(`cited ${result.snippet.sourceMessageId}, expected ${c.source}`);
  }
  for (const word of c.must) if (!text.includes(word.toLowerCase())) failures.push(`no "${word}"`);
  for (const word of c.forbid) if (text.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runPlaceQnaSuite(
  options: PlaceQnaSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadPlaceQnaCases()) {
    const result = await run(c, options);
    const failures = gradePlaceQna(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'place-qna', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'place-qna', outcome: 'fail' as const, reason })),
      output: result.ok
        ? `${result.snippet.sourceMessageId}: ${result.snippet.text}`
        : result.reason,
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: PLACE_QNA_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
