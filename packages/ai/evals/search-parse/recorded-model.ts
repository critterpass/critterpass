/**
 * DeepSeek's network boundary for the planning route suites (search-parse, link-extract,
 * place-compromise): replay serves a case's recorded responses in call order (a repair turn is a
 * second response); live calls DeepSeek and, with EVAL_RECORD=1, stores what it answered and how
 * long it took. The route code, the gateway and the validators always run for real.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { EvalMode } from '../lib/provider';
import type { CaseReport, SuiteReport } from '../lib/runner';
import { jsonResponse } from '../lib/transports';

interface Recorded {
  readonly status: number;
  readonly body: unknown;
}

interface Recording {
  readonly source: string;
  readonly latency_ms: number;
  readonly responses: readonly Recorded[];
}

export interface RecordedModel {
  readonly fetch: typeof fetch;
  /** Call this after the case ran: stores the recording when live and asked to. */
  readonly finish: () => void;
  /** Wall time of the case's model calls, in ms (live only). */
  readonly latencyMs: () => number;
}

export function recordedModel(
  file: string,
  options: { readonly mode: EvalMode; readonly record?: boolean },
): RecordedModel {
  if (options.mode === 'replay') {
    const recording = JSON.parse(readFileSync(file, 'utf8')) as Recording;
    const queue = [...recording.responses];
    return {
      fetch: () => {
        const next = queue.shift();
        if (next === undefined) return Promise.reject(new Error(`${file}: no response left`));
        return Promise.resolve(jsonResponse(next.body, next.status));
      },
      finish: () => undefined,
      latencyMs: () => recording.latency_ms,
    };
  }
  const responses: Recorded[] = [];
  let spent = 0;
  return {
    fetch: async (url, init) => {
      const started = performance.now();
      const response = await fetch(url, init);
      const body = (await response.clone().json()) as unknown;
      spent += performance.now() - started;
      responses.push({ status: response.status, body });
      return response;
    },
    finish: () => {
      if (options.record !== true || responses.length === 0) return;
      mkdirSync(dirname(file), { recursive: true });
      const recording: Recording = {
        source: `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`,
        latency_ms: Math.round(spent),
        responses,
      };
      writeFileSync(file, `${JSON.stringify(recording, null, 2)}\n`);
    },
    latencyMs: () => Math.round(spent),
  };
}

/** The p-th percentile (0–100) of the values, nearest rank. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)));
  return sorted[rank - 1] ?? 0;
}

/** One graded case: its failures become the assertions. */
export function caseReport(
  type: string,
  description: string,
  failures: readonly string[],
  output: string,
): CaseReport {
  return {
    description,
    outcome: failures.length === 0 ? 'pass' : 'fail',
    assertions:
      failures.length === 0
        ? [{ type, outcome: 'pass', reason: 'all checks' }]
        : failures.map((reason) => ({ type, outcome: 'fail' as const, reason })),
    output,
  };
}

export function suiteReport(
  suite: string,
  mode: EvalMode,
  threshold: number,
  cases: readonly CaseReport[],
): SuiteReport {
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = cases.length === 0 ? 0 : passed / cases.length;
  return {
    suite,
    mode,
    graded: cases.length,
    passed,
    score,
    threshold,
    ok: cases.length > 0 && score >= threshold,
    cases,
  };
}
