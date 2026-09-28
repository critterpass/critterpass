/**
 * Suites for single-purpose prompts whose cases live beside the prompt
 * (`src/prompts/<suite>/evals.yaml`): each case runs the prompt's real entry point through the real
 * gateway, with only DeepSeek's network boundary replayed (or live, optionally recorded), and is
 * graded on the validated result. A template fallback never passes: the suite measures the model.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TASTE_TAGS } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { personaIdSchema } from '../../src/persona/schema';
import { writeCrewWelcome } from '../../src/prompts/crew-welcome/prompt';
import { inferInviteTags } from '../../src/prompts/invite-tags/prompt';
import { loadFixture } from '../../test/fixture-transport';
import type { EvalMode } from './provider';
import type { CaseReport } from './runner';
import { jsonResponse } from './transports';

export const PROMPT_SUITES = ['invite-tags', 'crew-welcome'] as const;
export type PromptSuite = (typeof PROMPT_SUITES)[number];

export function isPromptSuite(name: string): name is PromptSuite {
  return (PROMPT_SUITES as readonly string[]).includes(name);
}

const tagSchema = z.enum(TASTE_TAGS);
const inviteTagsCase = z.object({
  fixture: z.string().min(1),
  guide: personaIdSchema,
  name: z.string().min(1),
  note: z.string().min(1).max(140),
  expect_any: z.array(tagSchema).optional(),
  forbid: z.array(tagSchema).optional(),
  max_tags: z.int().min(0).max(3).optional(),
});
const crewWelcomeCase = z.object({
  fixture: z.string().min(1),
  guide: personaIdSchema,
  newcomer: z.string().min(1),
  crew: z.string().min(1),
  members: z.int().positive(),
  place: z.string().optional(),
  forbid: z.array(z.string()).optional(),
});

export interface PromptRunOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

const PROMPTS_DIR = resolve(fileURLToPath(new URL('../../src/prompts/', import.meta.url)));
const RECORDED_AT = new Date().toISOString().slice(0, 10);

function transport(fixture: string, options: PromptRunOptions): typeof fetch {
  if (options.mode === 'replay') {
    return () => {
      const { response } = loadFixture(fixture, 'deepseek');
      return Promise.resolve(jsonResponse(response.body, response.status));
    };
  }
  if (options.record !== true) return fetch;
  let recorded = false;
  return async (url, init) => {
    const response = await fetch(url, init);
    if (recorded) return response;
    recorded = true;
    const body = (await response.clone().json()) as unknown;
    const dir = fileURLToPath(new URL('../../test/fixtures/deepseek/', import.meta.url));
    mkdirSync(dir, { recursive: true });
    const source = `Live recording from DeepSeek through its Anthropic-format API, ${RECORDED_AT}.`;
    writeFileSync(
      resolve(dir, `${fixture}.json`),
      `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
    );
    return response;
  };
}

function gatewayFor(fixture: string, options: PromptRunOptions) {
  return createGateway({
    apiKey: options.apiKey ?? 'replay',
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    fetch: transport(fixture, options),
    maxAttempts: 1,
  });
}

function loadCases(suite: PromptSuite): unknown[] {
  const text = readFileSync(resolve(PROMPTS_DIR, suite, 'evals.yaml'), 'utf8');
  const cases = parse(text) as unknown;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error(`${suite}: no cases`);
  return cases;
}

function report(description: string, failures: readonly string[], output: string): CaseReport {
  return {
    description,
    outcome: failures.length === 0 ? 'pass' : 'fail',
    assertions:
      failures.length === 0
        ? [{ type: 'prompt', outcome: 'pass', reason: 'all checks' }]
        : failures.map((reason) => ({ type: 'prompt', outcome: 'fail' as const, reason })),
    output,
  };
}

async function inviteTags(raw: unknown, options: PromptRunOptions): Promise<CaseReport> {
  const c = inviteTagsCase.parse(raw);
  const result = await inferInviteTags(gatewayFor(c.fixture, options), {
    note: c.note,
    inviteeName: c.name,
    guide: c.guide,
  });
  const failures: string[] = [];
  if (result.source !== 'model') failures.push('template fallback answered');
  if (c.expect_any !== undefined && !c.expect_any.some((tag) => result.tags.includes(tag))) {
    failures.push(`none of ${c.expect_any.join(', ')}`);
  }
  const forbidden = (c.forbid ?? []).filter((tag) => result.tags.includes(tag));
  if (forbidden.length > 0) failures.push(`forbidden ${forbidden.join(', ')}`);
  if (c.max_tags !== undefined && result.tags.length > c.max_tags) {
    failures.push(`${result.tags.length} tags > ${c.max_tags}`);
  }
  return report(`${c.fixture}: ${c.note}`, failures, JSON.stringify(result));
}

async function crewWelcome(raw: unknown, options: PromptRunOptions): Promise<CaseReport> {
  const c = crewWelcomeCase.parse(raw);
  const result = await writeCrewWelcome(gatewayFor(c.fixture, options), {
    newcomer: c.newcomer,
    crewName: c.crew,
    members: c.members,
    guide: c.guide,
    ...(c.place === undefined ? {} : { place: c.place }),
  });
  const failures: string[] = [];
  if (result.source !== 'model') failures.push('template fallback answered');
  const first = c.newcomer.split(/\s+/u)[0] ?? c.newcomer;
  if (!result.line.includes(first)) failures.push(`no ${first}`);
  const lower = result.line.toLowerCase();
  const forbidden = (c.forbid ?? []).filter((word) => lower.includes(word.toLowerCase()));
  if (forbidden.length > 0) failures.push(`forbidden ${forbidden.join(', ')}`);
  return report(`${c.fixture}: ${c.newcomer} → ${c.crew}`, failures, result.line);
}

export async function runPromptSuiteCases(
  suite: PromptSuite,
  options: PromptRunOptions,
): Promise<CaseReport[]> {
  const run = suite === 'invite-tags' ? inviteTags : crewWelcome;
  const reports: CaseReport[] = [];
  for (const raw of loadCases(suite)) reports.push(await run(raw, options));
  return reports;
}
