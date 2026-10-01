/**
 * The `translate` eval suite (`pnpm --filter @cp/ai eval translate`): guide-written lines across
 * the kinds that carry translations (cases.yaml), run through the real `translateGuideLines`
 * (prompt, gateway, validator); only DeepSeek's network boundary replays (`fixtures/<id>.json`).
 * A case passes when every line came back and was kept (bar the lines a case allows to stay in
 * the source), in the reader's script, with the business, dish and people names it names kept as
 * written, the local place names it expects, the must-say strings present and nothing forbidden.
 * Seeded cases grade the validator on a deliberate slip: exactly the named lines are rejected, for
 * the named reason, in both modes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  appLocaleSchema,
  GUIDE_TEXT_FIELDS,
  GUIDE_TEXT_KINDS,
  guideTextLimit,
  type GuideTextFieldSpec,
} from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { REPO_PACKS } from '../../src/persona/loader';
import { personaIdSchema } from '../../src/persona/schema';
import {
  translateGuideLines,
  translateReplySchema,
  validateTranslateReply,
  type TranslateLine,
  type TranslateResult,
} from '../../src/routes/translate';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const TRANSLATE_SUITE = 'translate';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases.yaml', import.meta.url));
const EMOJI = /\p{Extended_Pictographic}/u;

/** A character only the reader's language writes: proof the line is not still English. */
const SCRIPT: Readonly<Record<string, RegExp>> = {
  vi: /[ăâđêôơưàáảãạèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵ]/iu,
  ja: /[぀-ヿ]/u,
  ko: /[가-힯]/u,
  th: /[฀-๿]/u,
  'zh-Hans': /[一-鿿]/u,
};

const caseSchema = z.object({
  id: z.string().regex(/^translate-\d{2}$/u),
  description: z.string(),
  guide: personaIdSchema,
  locale: appLocaleSchema,
  lines: z
    .array(z.object({ kind: z.enum(GUIDE_TEXT_KINDS), field: z.string(), text: z.string().min(1) }))
    .min(1),
  /** Strings some kept line must contain (a time, an amount, a local place name). */
  must: z.array(z.string()).default([]),
  /** Names that stay exactly as written: businesses, dishes, people. */
  keep: z.array(z.string()).default([]),
  forbid: z.array(z.string()).default([]),
  /** Lines that may stay in the source language (a known limit, said in the description). */
  allow_source: z.number().int().nonnegative().default(0),
  seeded: z.boolean().default(false),
  reply: translateReplySchema.optional(),
  expect_rejected: z.array(z.object({ id: z.string(), reason: z.string() })).default([]),
});
type TranslateCase = z.infer<typeof caseSchema>;

export interface TranslateSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadTranslateCases(): TranslateCase[] {
  return z.array(caseSchema).parse(parse(readFileSync(CASES, 'utf8')) as unknown);
}

/** The case's lines as the worker's sweep builds them: ids in order, each with its own limit. */
export function linesOf(c: TranslateCase): TranslateLine[] {
  return c.lines.map((line, index) => {
    const specs: readonly GuideTextFieldSpec[] = GUIDE_TEXT_FIELDS[line.kind];
    const spec = specs.find((field) => field.name === line.field);
    if (spec === undefined) throw new Error(`${c.id}: ${line.kind} has no field ${line.field}`);
    return {
      id: `t${index + 1}`,
      text: line.text,
      max: guideTextLimit(spec, line.text),
      ...(spec.title === true ? { title: true } : {}),
    };
  });
}

function transport(c: TranslateCase, options: TranslateSuiteOptions): typeof fetch {
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

async function run(c: TranslateCase, options: TranslateSuiteOptions): Promise<TranslateResult> {
  const lines = linesOf(c);
  if (c.seeded) {
    const verdict = validateTranslateReply(c.reply ?? { items: [] }, lines);
    return { accepted: verdict.accepted, rejected: verdict.rejected, calls: 0 };
  }
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(c, options),
    maxAttempts: 1,
  });
  return translateGuideLines(gateway, { pack: REPO_PACKS[c.guide], locale: c.locale, lines });
}

export function gradeTranslate(c: TranslateCase, result: TranslateResult): string[] {
  const failures: string[] = [];
  const rejected = result.rejected.map((r) => `${r.id}:${r.reason}`).sort();
  if (c.seeded) {
    const expected = c.expect_rejected.map((r) => `${r.id}:${r.reason}`).sort();
    if (rejected.join(' ') !== expected.join(' ')) {
      failures.push(`rejected [${rejected.join(', ')}], expected [${expected.join(', ')}]`);
    }
    return failures;
  }
  if (result.rejected.length > c.allow_source) failures.push(`kept source: ${rejected.join(', ')}`);
  const lines = linesOf(c);
  const script = SCRIPT[c.locale];
  for (const line of lines) {
    const text = result.accepted.get(line.id);
    if (text === undefined) continue;
    if (EMOJI.test(text)) failures.push(`${line.id}: emoji`);
    // A sentence that comes back unchanged was not translated (a bare name may be).
    if (text === line.text && line.text.split(/\s+/u).length >= 6) {
      failures.push(`${line.id}: unchanged`);
    }
    if (script !== undefined && line.text.split(/\s+/u).length >= 6 && !script.test(text)) {
      failures.push(`${line.id}: not in ${c.locale}`);
    }
  }
  const text = [...result.accepted.values()].join('\n');
  for (const word of [...c.must, ...c.keep]) {
    if (!text.includes(word)) failures.push(`no "${word}"`);
  }
  const lower = text.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runTranslateSuite(
  options: TranslateSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadTranslateCases()) {
    const result = await run(c, options);
    const failures = gradeTranslate(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'translate', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'translate', outcome: 'fail' as const, reason })),
      output: linesOf(c)
        .map((line) => `${line.id}: ${result.accepted.get(line.id) ?? '(source kept)'}`)
        .join(' | '),
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: TRANSLATE_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
