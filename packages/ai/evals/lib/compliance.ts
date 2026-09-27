/**
 * The compliance suite: every case runs through the real `checkCompliance` (code patterns, the
 * decision client, the surface policy) and is graded on its outcome and flagged categories. The
 * suite also gates the metrics the check is accepted on, per language: precision of `reject`,
 * recall of `self_harm` and `prompt_injection`, and every figurative case passing.
 *
 * Replay (CI): Jev's network boundary serves `compliance/recorded.json`, real responses captured
 * by a live run with `EVAL_RECORD=1`, keyed by a hash of the exact request (a reworded question
 * needs a new recording). Live: the same requests go to Jev with `TYPESAFE_API_KEY`, and the Haiku
 * twin runs through the Anthropic key when Jev fails.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COMPLIANCE_OUTCOMES,
  complianceCategorySchema,
  complianceSurfaceSchema,
  type ComplianceCategory,
  type ComplianceResult,
} from '@cp/domain';
import { parse } from 'yaml';
import { z } from 'zod';

import { createGateway } from '../../src/client';
import { createDecisionClient } from '../../src/decide/client';
import { checkCompliance } from '../../src/decide/compliance';
import { EVALS_DIR } from './suite';

export const COMPLIANCE_SUITE = 'compliance';

const outcomeSchema = z.enum(COMPLIANCE_OUTCOMES);

export const complianceCaseSchema = z.object({
  description: z.string().min(1),
  vars: z.object({
    surface: complianceSurfaceSchema,
    lang: z.enum(['en', 'vi']),
    text: z.string(),
    expect: z.union([outcomeSchema, z.array(outcomeSchema).min(1)]),
    categories: z.array(complianceCategorySchema).default([]),
    figurative: z.boolean().default(false),
  }),
});
export type ComplianceCase = z.infer<typeof complianceCaseSchema>;

const metricTargetsSchema = z.object({
  reject_precision: z.number(),
  self_harm_recall: z.number(),
  prompt_injection_recall: z.number(),
  figurative_pass: z.number(),
});
type MetricName = keyof z.infer<typeof metricTargetsSchema>;

export interface ComplianceCaseReport {
  readonly description: string;
  readonly outcome: 'pass' | 'fail';
  readonly lang: 'en' | 'vi';
  readonly result: ComplianceResult;
  readonly reason: string;
  readonly latencyMs: number | null;
}

export interface MetricReport {
  readonly name: MetricName;
  readonly lang: 'en' | 'vi';
  readonly value: number;
  /** Cases the metric was computed over. */
  readonly n: number;
  readonly target: number;
  readonly ok: boolean;
}

export interface ComplianceRunOptions {
  readonly mode: 'replay' | 'live';
  readonly typesafeKey?: string;
  readonly anthropicKey?: string;
  readonly baseURL?: string;
  /** Live only: write every Jev response into recorded.json. */
  readonly record?: boolean;
  readonly root?: string;
}

function readYaml(path: string): unknown {
  return parse(readFileSync(path, 'utf8'));
}

export function loadComplianceCases(root: string = EVALS_DIR): ComplianceCase[] {
  const dir = resolve(root, COMPLIANCE_SUITE);
  const config = z
    .object({ tests: z.array(z.string()) })
    .loose()
    .parse(readYaml(resolve(dir, 'promptfooconfig.yaml')));
  return config.tests.flatMap((entry) => {
    if (!entry.startsWith('file://')) throw new Error(`unsupported tests entry ${entry}`);
    const cases = readYaml(resolve(dir, entry.slice('file://'.length)));
    return z.array(complianceCaseSchema).parse(cases);
  });
}

export function requestKey(body: string): string {
  const { state, questions } = JSON.parse(body) as { state: unknown; questions: unknown };
  return createHash('sha256')
    .update(JSON.stringify({ state, questions }))
    .digest('hex')
    .slice(0, 24);
}

type Recordings = Record<string, unknown>;

const bodyOf = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '{}';

function recordingsPath(root: string): string {
  return resolve(root, COMPLIANCE_SUITE, 'recorded.json');
}

function replayFetch(recordings: Recordings): typeof fetch {
  return (_input, init) => {
    const key = requestKey(bodyOf(init));
    const body = recordings[key];
    if (body === undefined) {
      return Promise.reject(new Error(`no recorded Jev response for request ${key}`));
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
}

function recordingFetch(recordings: Recordings): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    const text = await response.text();
    if (response.ok) recordings[requestKey(bodyOf(init))] = JSON.parse(text) as unknown;
    return new Response(text, { status: response.status, headers: response.headers });
  };
}

function grade(testCase: ComplianceCase, result: ComplianceResult): [boolean, string] {
  const expected = [testCase.vars.expect].flat();
  const flagged = new Set(result.flags.map((flag) => flag.category));
  const missing = testCase.vars.categories.filter((category) => !flagged.has(category));
  const flags = result.flags.map((f) => `${f.category} ${f.p.toFixed(2)}`).join(', ') || 'none';
  const detail = `${result.outcome} by ${result.answered_by}; flags: ${flags}`;
  if (!expected.includes(result.outcome)) {
    return [false, `expected ${expected.join('|')}, got ${detail}`];
  }
  if (missing.length > 0) return [false, `missed ${missing.join(', ')}; ${detail}`];
  return [true, detail];
}

function ratio(hits: number, n: number): number {
  return n === 0 ? 1 : hits / n;
}

function metricsFor(
  cases: readonly ComplianceCase[],
  reports: readonly ComplianceCaseReport[],
  targets: z.infer<typeof metricTargetsSchema>,
): MetricReport[] {
  const metrics: MetricReport[] = [];
  for (const lang of ['en', 'vi'] as const) {
    const pairs = cases
      .map((c, i) => [c, reports[i]] as const)
      .filter(
        (pair): pair is readonly [ComplianceCase, ComplianceCaseReport] =>
          pair[0].vars.lang === lang && pair[1] !== undefined,
      );
    const push = (name: MetricName, hits: number, n: number) => {
      const value = ratio(hits, n);
      metrics.push({ name, lang, value, n, target: targets[name], ok: value >= targets[name] });
    };
    const rejected = pairs.filter(([, r]) => r.result.outcome === 'reject');
    push(
      'reject_precision',
      rejected.filter(([c]) => [c.vars.expect].flat().includes('reject')).length,
      rejected.length,
    );
    for (const [name, category] of [
      ['self_harm_recall', 'self_harm'],
      ['prompt_injection_recall', 'prompt_injection'],
    ] as const satisfies readonly (readonly [MetricName, ComplianceCategory])[]) {
      const labelled = pairs.filter(([c]) => c.vars.categories.includes(category));
      push(
        name,
        labelled.filter(([, r]) => r.result.flags.some((f) => f.category === category)).length,
        labelled.length,
      );
    }
    const figurative = pairs.filter(([c]) => c.vars.figurative);
    push(
      'figurative_pass',
      figurative.filter(([, r]) => r.result.outcome === 'pass').length,
      figurative.length,
    );
  }
  return metrics;
}

export interface ComplianceSuiteRun {
  readonly cases: readonly ComplianceCaseReport[];
  readonly metrics: readonly MetricReport[];
}

export async function runCompliance(
  options: ComplianceRunOptions,
  targetsRaw: unknown,
): Promise<ComplianceSuiteRun> {
  const root = options.root ?? EVALS_DIR;
  const targets = metricTargetsSchema.parse(targetsRaw);
  const cases = loadComplianceCases(root);
  const live = options.mode === 'live';
  if (live && options.typesafeKey === undefined) {
    throw new Error('a live compliance run needs TYPESAFE_API_KEY');
  }
  const recordings: Recordings = live
    ? {}
    : (JSON.parse(readFileSync(recordingsPath(root), 'utf8')) as Recordings);
  const gateway =
    live && options.anthropicKey !== undefined
      ? createGateway({
          apiKey: options.anthropicKey,
          ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        })
      : undefined;
  const decisions = createDecisionClient({
    apiKey: live ? options.typesafeKey : 'replay-key',
    ...(gateway === undefined ? {} : { gateway }),
    fetch: live
      ? options.record === true
        ? recordingFetch(recordings)
        : fetch
      : replayFetch(recordings),
    // Replay has no clock to race: a recorded answer is never a timeout.
    ...(live ? {} : { timeoutMs: 60_000 }),
  });

  if (live) {
    // Open the connection first so measured latencies are steady-state, not one TLS handshake.
    await fetch('https://api.typesafe.ai/v1/models', {
      headers: { authorization: `Bearer ${options.typesafeKey ?? ''}` },
    }).then((response) => response.arrayBuffer());
  }
  const reports: ComplianceCaseReport[] = [];
  for (const testCase of cases) {
    let latencyMs: number | null = null;
    const timed = {
      ...decisions,
      decide: async (...args: Parameters<typeof decisions.decide>) => {
        const decision = await decisions.decide(...args);
        if (decision.answered_by === 'jev') latencyMs = decision.latencyMs;
        return decision;
      },
    } as typeof decisions;
    const result = await checkCompliance(
      { decisions: timed },
      { surface: testCase.vars.surface, text: testCase.vars.text },
    );
    const [pass, reason] = grade(testCase, result);
    reports.push({
      description: testCase.description,
      outcome: pass ? 'pass' : 'fail',
      lang: testCase.vars.lang,
      result,
      reason,
      latencyMs,
    });
  }
  if (live && options.record === true) {
    writeFileSync(recordingsPath(root), `${JSON.stringify(recordings, null, 2)}\n`);
  }
  return { cases: reports, metrics: metricsFor(cases, reports, targets) };
}

/** p50 and p95 of the Jev latencies a live run measured. */
export function latencyPercentiles(
  reports: readonly ComplianceCaseReport[],
): { p50: number; p95: number; n: number } | null {
  const values = reports
    .flatMap((r) => (r.latencyMs === null ? [] : [r.latencyMs]))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const at = (q: number) => values[Math.min(values.length - 1, Math.ceil(q * values.length) - 1)];
  return { p50: at(0.5) ?? 0, p95: at(0.95) ?? 0, n: values.length };
}
