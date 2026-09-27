/**
 * Loading promptfoo suites (`evals/<suite>/promptfooconfig.yaml`): the config's `tests` may be
 * inline cases or `file://` references to case files in promptfoo's `tests` format. Case `vars`
 * are validated here, so a malformed case fails loudly instead of silently grading nothing.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { aiRouteSchema } from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { UNTRUSTED_KINDS } from '../../src/context/wrap-untrusted';
import { chattinessLevelSchema, personaIdSchema } from '../../src/persona/schema';

export const EVALS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const toolCallSchema = z.object({
  name: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

/** The recorded model response a replay run serves instead of calling the API. */
export const replaySchema = z.object({
  /** A recorded response in test/fixtures/anthropic (`<name>.json`). */
  fixture: z.string().min(1).optional(),
  /** Or an inline answer: text (JSON text on structured routes) and/or tool calls. */
  text: z.string().optional(),
  tool_calls: z.array(toolCallSchema).optional(),
  stop_reason: z.enum(['end_turn', 'tool_use', 'refusal', 'max_tokens']).optional(),
});

export const actionSchema = z.object({
  kind: z.string().min(1),
  reversible: z.boolean().default(true),
  cost_delta_minor: z.number().int().default(0),
  booking_impact: z.boolean().default(false),
  affected: z.array(z.uuid()),
  requester: z.uuid().nullable(),
  time_critical: z.boolean().default(false),
  in_trip: z.boolean().default(false),
});

export const caseVarsSchema = z
  .object({
    route: aiRouteSchema,
    question: z.string().min(1),
    persona: personaIdSchema.optional(),
    chattiness: chattinessLevelSchema.default('normal'),
    locale: z.string().default('en'),
    trip_context: z.string().optional(),
    untrusted: z
      .array(
        z.object({
          kind: z.enum(UNTRUSTED_KINDS),
          text: z.string(),
          source: z.string(),
          label: z.string().optional(),
        }),
      )
      .optional(),
    /** Tool outputs the model saw this turn: the only values it may cite. */
    tool_results: z.array(z.object({ tool: z.string(), output: z.unknown() })).optional(),
    /** The guide action the reply is about; graded against the autonomy decider. */
    action: actionSchema.optional(),
    expect_decision: z.enum(['auto', 'needs_yes', 'forbidden']).optional(),
    replay: replaySchema.optional(),
    /** Shorthand for `replay.fixture` (the web search cases). */
    fixture: z.string().optional(),
  })
  .loose();
export type CaseVars = z.infer<typeof caseVarsSchema>;

export interface Assertion {
  readonly type: string;
  readonly value?: unknown;
  readonly threshold?: number;
}

export interface EvalCase {
  readonly description: string;
  readonly vars: CaseVars;
  readonly assert: readonly Assertion[];
}

export interface Suite {
  readonly name: string;
  readonly description: string;
  readonly cases: readonly EvalCase[];
}

const rawCaseSchema = z.object({
  description: z.string().min(1),
  vars: z.record(z.string(), z.unknown()),
  assert: z.array(z.object({ type: z.string().min(1), value: z.unknown().optional() }).loose()),
});

const configSchema = z
  .object({
    description: z.string().min(1),
    tests: z.array(z.union([z.string(), rawCaseSchema])),
  })
  .loose();

function readYaml(path: string): unknown {
  return parse(readFileSync(path, 'utf8'));
}

function casesFrom(entry: unknown, dir: string): EvalCase[] {
  if (typeof entry === 'string') {
    if (!entry.startsWith('file://')) throw new Error(`unsupported tests entry ${entry}`);
    const path = resolve(dir, entry.slice('file://'.length));
    const loaded = readYaml(path);
    return (Array.isArray(loaded) ? loaded : [loaded]).flatMap((item) =>
      casesFrom(item, dirname(path)),
    );
  }
  const raw = rawCaseSchema.parse(entry);
  const vars = caseVarsSchema.safeParse(raw.vars);
  if (!vars.success) {
    throw new Error(
      `eval case "${raw.description}": ${vars.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return [{ description: raw.description, vars: vars.data, assert: raw.assert }];
}

export function loadSuite(name: string, root: string = EVALS_DIR): Suite {
  const dir = resolve(root, name);
  const config = configSchema.parse(readYaml(resolve(dir, 'promptfooconfig.yaml')));
  return {
    name,
    description: config.description,
    cases: config.tests.flatMap((entry) => casesFrom(entry, dir)),
  };
}
