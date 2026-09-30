/**
 * The `quests` eval suite (`pnpm --filter @cp/ai eval quests`): trip days across the guides
 * (cases/days.yaml) run through the real `writeQuests` (prompt, gateway, validator, fallback fill);
 * only DeepSeek's network boundary replays (`fixtures/<id>.json`). A day passes when every quest the
 * guide proposed survived the validator, at least three came from the guide, the day has three or
 * more quests, no copy carries an emoji and nothing forbidden (planted instructions) is repeated.
 * The suite score is the share of passing days. Seeded cases (cases/seeded.yaml) grade the
 * validator on deliberate slips: each must be dropped, in both modes.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUILTIN_QUEST_TEMPLATES, MIN_DAILY_QUESTS, templateMap } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { personaIdSchema } from '../../src/persona/schema';
import {
  fromReply,
  questsReplySchema,
  writeQuests,
  type QuestsPromptInput,
  type QuestsResult,
} from '../../src/routes/quests';
import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

export const QUESTS_SUITE = 'quests';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const CASES = fileURLToPath(new URL('./cases/', import.meta.url));
const EMOJI = /\p{Extended_Pictographic}/u;

const itemSchema = z.object({
  id: z.string(),
  poi_id: z.string().nullable(),
  name: z.string(),
  start: z.string().nullable(),
  category: z.string().nullable(),
});

const daySchema = z.object({
  localDate: z.string(),
  tz: z.string(),
  travellers: z.number().int().min(1),
  visitConsent: z.boolean(),
  items: z.array(itemSchema),
  expenseCategories: z.array(z.string()),
  critterSets: z.array(z.string()),
  copresenceForms: z.record(z.string(), z.string()),
  openBalance: z.boolean(),
  lastDay: z.boolean(),
});

const caseSchema = z.object({
  id: z.string().regex(/^quests-\d{2}$/u),
  description: z.string(),
  guide: personaIdSchema,
  place: z.string(),
  day: daySchema,
  forbid: z.array(z.string()).default([]),
  seeded: z.boolean().default(false),
  reply: questsReplySchema.optional(),
  expect_rejected: z.array(z.string()).default([]),
});
type QuestsCase = z.infer<typeof caseSchema>;

export interface QuestsSuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function loadQuestsCases(): QuestsCase[] {
  return readdirSync(CASES)
    .filter((file) => file.endsWith('.yaml'))
    .sort()
    .flatMap((file) =>
      z.array(caseSchema).parse(parse(readFileSync(resolve(CASES, file), 'utf8'))),
    );
}

function transport(c: QuestsCase, options: QuestsSuiteOptions): typeof fetch {
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

function inputOf(c: QuestsCase): QuestsPromptInput {
  return {
    guide: c.guide,
    place: c.place,
    day: c.day,
    templates: templateMap(BUILTIN_QUEST_TEMPLATES),
  };
}

async function run(c: QuestsCase, options: QuestsSuiteOptions): Promise<QuestsResult> {
  if (c.seeded) return fromReply(c.reply?.quests ?? [], inputOf(c));
  const gateway = createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(c, options),
    maxAttempts: 1,
  });
  return writeQuests(gateway, inputOf(c));
}

export function gradeQuests(c: QuestsCase, result: QuestsResult): string[] {
  const failures: string[] = [];
  if (c.seeded) {
    for (const reason of c.expect_rejected) {
      if (!result.rejected.includes(reason)) failures.push(`slip kept: ${reason}`);
    }
  } else {
    if (result.rejected.length > 0) failures.push(`dropped ${result.rejected.join(', ')}`);
    if (result.fromGuide < MIN_DAILY_QUESTS) failures.push(`${result.fromGuide} from the guide`);
  }
  if (result.quests.length < MIN_DAILY_QUESTS) failures.push(`${result.quests.length} quests`);
  const text = result.quests.map((quest) => `${quest.title} ${quest.desc}`).join('\n');
  if (EMOJI.test(text)) failures.push('emoji');
  const lower = text.toLowerCase();
  for (const word of c.forbid) if (lower.includes(word.toLowerCase())) failures.push(`"${word}"`);
  return failures;
}

export async function runQuestsSuite(
  options: QuestsSuiteOptions,
  threshold: number,
): Promise<SuiteReport> {
  const cases: CaseReport[] = [];
  for (const c of loadQuestsCases()) {
    const result = await run(c, options);
    const failures = gradeQuests(c, result);
    cases.push({
      description: `${c.id}: ${c.description}`,
      outcome: failures.length === 0 ? 'pass' : 'fail',
      assertions:
        failures.length === 0
          ? [{ type: 'quests', outcome: 'pass', reason: 'all checks' }]
          : failures.map((reason) => ({ type: 'quests', outcome: 'fail' as const, reason })),
      output: result.quests
        .map((quest) => `${quest.template}: ${quest.title} — ${quest.desc}`)
        .join(' | '),
    });
  }
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite: QUESTS_SUITE,
    mode: options.mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
