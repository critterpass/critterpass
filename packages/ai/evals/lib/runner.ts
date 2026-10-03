/**
 * Runs suites and grades them: promptfoo assertion types (`contains`, `icontains`, `*-any`,
 * `regex`, `equals`, `is-json`, each with a `not-` form, `javascript` graders from ../graders.ts
 * and `llm-rubric`) over each case's output. A case passes when every graded assertion passes; the
 * suite passes when its pass rate reaches the threshold stored in ../thresholds.json for the mode.
 * `llm-rubric` needs a model: it is graded in live runs and reported as skipped in replay runs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createGateway } from '../../src/client';
import { GRADERS, type GradeResult } from '../graders';
import {
  COMPLIANCE_SUITE,
  latencyPercentiles,
  runCompliance,
  type MetricReport,
} from './compliance';
import { isPromptSuite, runPromptSuiteCases } from './prompt-suites';
import { DRAFT_SUITE, runDraftSuite } from '../draft/suite';
import { GUIDE_SUITE, runGuideSuite } from '../guide/suite';
import { BRIEFING_SUITE, runBriefingSuite } from '../briefing/suite';
import { DISRUPTION_SUITE, runDisruptionSuite } from '../disruption/suite';
import { runWatchSuite, WATCH_SUITE } from '../watch/suite';
import { REPLAN_SUITE, runReplanSuite } from '../replan/suite';
import { LATE_SUITE, runLateSuite } from '../late/suite';
import { PLACE_QNA_SUITE, runPlaceQnaSuite } from '../explore/suite';
import { PROPOSAL_SUITE, runProposalSuite } from '../proposal/suite';
import { QUESTS_SUITE, runQuestsSuite } from '../quests/suite';
import { RECAP_SUITE, runRecapSuite } from '../recap/suite';
import { ALBUM_SUITE, runAlbumSuite } from '../album/suite';
import { runTranslateSuite, TRANSLATE_SUITE } from '../translate/suite';
import { HELP_SUITE, runHelpSuite } from '../help/suite';
import { SOS_SUITE, runSosSuite } from '../sos/suite';
import { runCase, type EvalMode, type EvalOutput, type Pipeline } from './provider';
import { EVALS_DIR, loadSuite, type Assertion, type CaseVars, type EvalCase } from './suite';

export interface AssertionReport {
  readonly type: string;
  readonly outcome: 'pass' | 'fail' | 'skipped';
  readonly reason: string;
}

export interface CaseReport {
  readonly description: string;
  readonly outcome: 'pass' | 'fail' | 'skipped';
  readonly assertions: readonly AssertionReport[];
  /** What the client was shown (or the error code), for triaging a failed case. */
  readonly output?: string;
}

export interface SuiteReport {
  readonly suite: string;
  readonly mode: EvalMode;
  readonly graded: number;
  readonly passed: number;
  readonly score: number;
  readonly threshold: number;
  readonly ok: boolean;
  readonly cases: readonly CaseReport[];
  /** Suite-level metrics gated beside the pass rate (the compliance suite). */
  readonly metrics?: readonly MetricReport[];
  /** Jev latency a live compliance run measured. */
  readonly latency?: { readonly p50: number; readonly p95: number; readonly n: number } | null;
}

export interface RunOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  /** Live runs only: an Anthropic-format endpoint to grade instead of DeepSeek's. */
  readonly baseURL?: string;
  /** Live web search cases: the search provider key. */
  readonly searchKey?: string;
  /** Live decision suites: the Jev key. */
  readonly typesafeKey?: string;
  /** Live runs: store the responses as the replay recordings (Jev, DeepSeek, Tavily). */
  readonly record?: boolean;
  /** Swapped code-side checks (tests prove the gate fails when one regresses). */
  readonly pipeline?: Pipeline;
  /** Extra cases appended to the suite (seeded regressions in tests). */
  readonly extraCases?: readonly EvalCase[];
  readonly root?: string;
}

type Thresholds = Record<EvalMode, Record<string, number>> & {
  readonly compliance_metrics?: unknown;
};

export function loadThresholds(root: string = EVALS_DIR): Thresholds {
  return JSON.parse(readFileSync(resolve(root, 'thresholds.json'), 'utf8')) as Thresholds;
}

async function runComplianceSuite(options: RunOptions, threshold: number): Promise<SuiteReport> {
  const thresholds = loadThresholds(options.root);
  const run = await runCompliance(
    {
      mode: options.mode,
      ...(options.typesafeKey === undefined ? {} : { typesafeKey: options.typesafeKey }),
      ...(options.apiKey === undefined ? {} : { generationKey: options.apiKey }),
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      ...(options.record === undefined ? {} : { record: options.record }),
      ...(options.root === undefined ? {} : { root: options.root }),
    },
    thresholds.compliance_metrics,
  );
  const passed = run.cases.filter((c) => c.outcome === 'pass').length;
  const graded = run.cases.length;
  const score = graded === 0 ? 0 : passed / graded;
  return {
    suite: COMPLIANCE_SUITE,
    mode: options.mode,
    graded,
    passed,
    score,
    threshold,
    ok: graded > 0 && score >= threshold && run.metrics.every((m) => m.ok),
    cases: run.cases.map((c) => ({
      description: `[${c.lang}] ${c.description}`,
      outcome: c.outcome,
      assertions: [{ type: 'compliance', outcome: c.outcome, reason: c.reason }],
    })),
    metrics: run.metrics,
    latency: options.mode === 'live' ? latencyPercentiles(run.cases) : null,
  };
}

const JUDGE_SYSTEM = [
  'You grade one reply from a travel guide character against a rubric.',
  'Check each criterion the rubric states, literally, and nothing else: never add criteria of your own.',
  'Local words are words from the destination language, not ordinary English words or place names.',
  'Facts listed under "Known to the guide" are not invented.',
  'A criterion written as "only X" is met when the reply uses X or nothing of that kind.',
  'Answer with JSON only: {"pass": true|false, "reason": "<one sentence naming any unmet criterion>"}.',
].join(' ');

/** What the guide was given for this case, so the judge can tell a known fact from an invented one. */
function knownFacts(output: EvalOutput, vars: CaseVars): string {
  const facts: string[] = [];
  const pack = output.pack;
  if (pack !== null) {
    const role =
      pack.guest_mode === null
        ? `the live guide for ${pack.destination ?? 'its home destination'}`
        : 'a guest guide covering a destination it has no local pack for';
    facts.push(`The guide is ${pack.name}, a ${pack.species}, ${role}.`);
    facts.push(`The guide's own lines: ${[pack.tagline, ...pack.catchphrases].join(' / ')}`);
  }
  if (vars.trip_context !== undefined) facts.push(`Trip context: ${vars.trip_context}`);
  for (const result of vars.tool_results ?? []) {
    facts.push(`Tool ${result.tool} returned: ${JSON.stringify(result.output)}`);
  }
  return facts.length === 0 ? 'nothing beyond the question' : facts.join('\n');
}

async function judge(
  rubric: string,
  output: EvalOutput,
  vars: CaseVars,
  apiKey: string,
  baseURL: string | undefined,
): Promise<GradeResult> {
  const gateway = createGateway({ apiKey, ...(baseURL === undefined ? {} : { baseURL }) });
  const content = [
    `Rubric: ${rubric}`,
    `Known to the guide:\n${knownFacts(output, vars)}`,
    `Question: ${vars.question}`,
    `Reply:\n${output.text}`,
  ].join('\n\n');
  // A pro route that thinks before answering; the judge sends no tools.
  const result = await gateway.callModel('draft.repair', {
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content }],
  });
  const text = result.message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  const verdict = JSON.parse(
    text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1),
  ) as GradeResult;
  return { pass: verdict.pass === true, reason: String(verdict.reason) };
}

function asList(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).map(String);
}

function baseCheck(type: string, value: unknown, output: EvalOutput): GradeResult | undefined {
  const text = output.text;
  const lower = text.toLowerCase();
  const values = asList(value);
  const hit = (list: string[], insensitive: boolean) =>
    list.filter((v) => (insensitive ? lower.includes(v.toLowerCase()) : text.includes(v)));
  switch (type) {
    case 'equals':
      return { pass: text === String(value), reason: 'equals' };
    case 'contains':
    case 'icontains':
      return {
        pass: hit(values, type === 'icontains').length === values.length,
        reason: `${type} ${values.join(', ')}`,
      };
    case 'contains-any':
    case 'icontains-any': {
      const found = hit(values, type === 'icontains-any');
      return {
        pass: found.length > 0,
        reason: found.length > 0 ? `found ${found.join(', ')}` : 'none found',
      };
    }
    case 'contains-all':
      return { pass: hit(values, false).length === values.length, reason: 'contains-all' };
    case 'regex':
      return { pass: new RegExp(String(value), 'u').test(text), reason: `regex ${String(value)}` };
    case 'is-json':
      return { pass: output.structured !== undefined, reason: 'is-json' };
    default:
      return undefined;
  }
}

export async function check(
  assertion: Assertion,
  output: EvalOutput,
  testCase: EvalCase,
  options: RunOptions,
): Promise<AssertionReport> {
  const negated = assertion.type.startsWith('not-');
  const type = negated ? assertion.type.slice(4) : assertion.type;
  let result: GradeResult | undefined;
  if (type === 'javascript') {
    const name = String(assertion.value).split(':').at(-1) ?? '';
    const grader = GRADERS[name];
    if (grader === undefined) throw new Error(`unknown grader ${name}`);
    result = grader(output, testCase.vars);
  } else if (type === 'llm-rubric') {
    if (options.mode === 'replay')
      return { type: assertion.type, outcome: 'skipped', reason: 'needs a live model' };
    result = await judge(
      String(assertion.value),
      output,
      testCase.vars,
      options.apiKey ?? '',
      options.baseURL,
    );
  } else {
    result = baseCheck(type, assertion.value, output);
  }
  if (result === undefined) throw new Error(`unsupported assertion type ${assertion.type}`);
  const pass = negated ? !result.pass : result.pass;
  return { type: assertion.type, outcome: pass ? 'pass' : 'fail', reason: result.reason };
}

export async function runSuite(name: string, options: RunOptions): Promise<SuiteReport> {
  const threshold = loadThresholds(options.root)[options.mode][name];
  if (threshold === undefined) throw new Error(`no ${options.mode} threshold for suite ${name}`);
  if (name === COMPLIANCE_SUITE) return runComplianceSuite(options, threshold);
  if (name === GUIDE_SUITE) return runGuideSuite(options, threshold);
  if (name === BRIEFING_SUITE) return runBriefingSuite(options, threshold);
  if (name === DISRUPTION_SUITE) return runDisruptionSuite(options, threshold);
  if (name === WATCH_SUITE) return runWatchSuite(options, threshold);
  if (name === REPLAN_SUITE) return runReplanSuite(options, threshold);
  if (name === LATE_SUITE) return runLateSuite(options, threshold);
  if (name === PLACE_QNA_SUITE) return runPlaceQnaSuite(options, threshold);
  if (name === PROPOSAL_SUITE) return runProposalSuite(options, threshold);
  if (name === QUESTS_SUITE) return runQuestsSuite(options, threshold);
  if (name === RECAP_SUITE) return runRecapSuite(options, threshold);
  if (name === ALBUM_SUITE) return runAlbumSuite(options, threshold);
  if (name === TRANSLATE_SUITE) return runTranslateSuite(options, threshold);
  if (name === HELP_SUITE) return runHelpSuite(options, threshold);
  if (name === SOS_SUITE) return runSosSuite(options, threshold);
  if (name === DRAFT_SUITE) {
    return runDraftSuite(
      {
        mode: options.mode,
        ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        ...(options.record === undefined ? {} : { record: options.record }),
      },
      threshold,
    );
  }
  const cases: CaseReport[] = [];
  if (isPromptSuite(name)) {
    cases.push(
      ...(await runPromptSuiteCases(name, {
        mode: options.mode,
        ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        ...(options.record === undefined ? {} : { record: options.record }),
      })),
    );
  }
  const suite = isPromptSuite(name) ? { cases: [] } : loadSuite(name, options.root);
  for (const testCase of [...suite.cases, ...(options.extraCases ?? [])]) {
    const output = await runCase(testCase.vars, {
      mode: options.mode,
      ...(options.pipeline === undefined ? {} : { pipeline: options.pipeline }),
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
      ...(options.searchKey === undefined ? {} : { searchKey: options.searchKey }),
      ...(options.record === undefined ? {} : { record: options.record }),
    });
    const assertions: AssertionReport[] = [];
    for (const assertion of testCase.assert)
      assertions.push(await check(assertion, output, testCase, options));
    const graded = assertions.filter((a) => a.outcome !== 'skipped');
    const outcome =
      graded.length === 0 ? 'skipped' : graded.every((a) => a.outcome === 'pass') ? 'pass' : 'fail';
    cases.push({
      description: testCase.description,
      outcome,
      assertions,
      output: output.error ?? output.text,
    });
  }
  const graded = cases.filter((c) => c.outcome !== 'skipped').length;
  const passed = cases.filter((c) => c.outcome === 'pass').length;
  const score = graded === 0 ? 0 : passed / graded;
  return {
    suite: name,
    mode: options.mode,
    graded,
    passed,
    score,
    threshold,
    ok: graded > 0 && score >= threshold,
    cases,
  };
}
