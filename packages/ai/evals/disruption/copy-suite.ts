/**
 * The grounded-copy eval harness shared by the disruption suites (`disruption`, `watch`, `replan`,
 * `late`): each case is a set of rows as code computes them, run through the route's real writer
 * (prompt, gateway, validator, template fallback); only DeepSeek's network boundary replays
 * (`fixtures/<id>.json`, recorded live with `EVAL_RECORD=1`). A case passes when the guide's own
 * words came back (not the templates), every number is grounded in its row's facts, no line claims
 * what the facts do not say, the must-say strings appear and nothing forbidden does. Seeded cases
 * grade the validator on a deliberate slip: the templates must answer, in both modes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway, type Gateway } from '../../src/client';
import { personaIdSchema, type PersonaId } from '../../src/persona/schema';
import {
  copyReplySchema,
  inputSources,
  itemSources,
  templateCopy,
  ungroundedIn,
  validateCopyReply,
  type CopyInput,
  type CopyLimits,
  type CopyResult,
} from '../../src/routes/disruption';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

const EMOJI = /\p{Extended_Pictographic}/u;
const facts = z.record(z.string(), z.union([z.string(), z.number()]));

export const copyCaseSchema = z.object({
  id: z.string().regex(/^[a-z]+-\d{2}$/u),
  description: z.string(),
  guide: personaIdSchema,
  input: z.object({
    facts,
    headlineTemplate: z.string(),
    detailTemplate: z.string(),
    items: z.array(z.object({ id: z.string(), kind: z.string(), facts, template: z.string() })),
  }),
  must: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
  seeded: z.boolean().default(false),
  reply: copyReplySchema.optional(),
  expect_fallback: z.boolean().default(false),
});
export type CopyCase = z.infer<typeof copyCaseSchema>;

export interface CopySuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export interface CopySuiteSpec {
  readonly name: string;
  readonly dir: string;
  readonly limits: CopyLimits;
  readonly write: (
    gateway: Pick<Gateway, 'callModel'>,
    guide: PersonaId,
    input: CopyInput,
  ) => Promise<CopyResult>;
}

function transport(spec: CopySuiteSpec, c: CopyCase, options: CopySuiteOptions): typeof fetch {
  const file = resolve(spec.dir, 'fixtures', `${c.id}.json`);
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
      mkdirSync(resolve(spec.dir, 'fixtures'), { recursive: true });
      const source = `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`;
      writeFileSync(
        file,
        `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
      );
    }
    return response;
  };
}

export function loadCopyCases(dir: string): CopyCase[] {
  const raw = parse(readFileSync(resolve(dir, 'cases.yaml'), 'utf8')) as unknown;
  return z.array(copyCaseSchema).parse(raw);
}

async function run(spec: CopySuiteSpec, c: CopyCase, options: CopySuiteOptions) {
  if (c.seeded) {
    const verdict = validateCopyReply(
      c.reply ?? { headline: '', detail: '', items: [] },
      c.input,
      spec.limits,
    );
    return verdict.ok ? verdict.result : templateCopy(c.input, verdict.reason);
  }
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(spec, c, options),
    maxAttempts: 1,
  });
  return spec.write(gateway, c.guide, c.input);
}

export function gradeCopy(c: CopyCase, result: CopyResult): string[] {
  const failures: string[] = [];
  if (result.fallbackUsed !== c.expect_fallback) {
    failures.push(
      result.fallbackUsed ? `template answered (${result.rejected ?? 'unknown'})` : 'slip accepted',
    );
  }
  const everything = inputSources(c.input);
  for (const text of [result.headline, result.detail]) {
    const loose = ungroundedIn(text, everything);
    if (loose.length > 0) failures.push(`ungrounded ${loose.join(', ')}`);
  }
  for (const item of c.input.items) {
    const line = result.lines[item.id] ?? '';
    const loose = ungroundedIn(line, itemSources(item, c.input.facts));
    if (loose.length > 0) failures.push(`ungrounded ${item.id}: ${loose.join(', ')}`);
  }
  const text = [result.headline, result.detail, ...Object.values(result.lines)].join('\n');
  if (EMOJI.test(text)) failures.push('emoji');
  for (const word of c.must) if (!text.includes(word)) failures.push(`no "${word}"`);
  const lower = text.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runCopySuite(
  spec: CopySuiteSpec,
  options: CopySuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadCopyCases(spec.dir)) {
    const result = await run(spec, c, options);
    const failures = gradeCopy(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: spec.name, outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: spec.name, outcome: 'fail' as const, reason })),
      output: [result.headline, result.detail, ...Object.values(result.lines)].join(' | '),
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: spec.name,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
