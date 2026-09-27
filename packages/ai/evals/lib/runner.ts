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
import { runCase, type EvalMode, type EvalOutput, type Pipeline } from './provider';
import { EVALS_DIR, loadSuite, type Assertion, type EvalCase } from './suite';

export interface AssertionReport {
  readonly type: string;
  readonly outcome: 'pass' | 'fail' | 'skipped';
  readonly reason: string;
}

export interface CaseReport {
  readonly description: string;
  readonly outcome: 'pass' | 'fail' | 'skipped';
  readonly assertions: readonly AssertionReport[];
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
}

export interface RunOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  /** Live runs only: an Anthropic-compatible endpoint to grade instead of Anthropic's API. */
  readonly baseURL?: string;
  /** Swapped code-side checks (tests prove the gate fails when one regresses). */
  readonly pipeline?: Pipeline;
  /** Extra cases appended to the suite (seeded regressions in tests). */
  readonly extraCases?: readonly EvalCase[];
  readonly root?: string;
}

type Thresholds = Record<EvalMode, Record<string, number>>;

export function loadThresholds(root: string = EVALS_DIR): Thresholds {
  return JSON.parse(readFileSync(resolve(root, 'thresholds.json'), 'utf8')) as Thresholds;
}

const JUDGE_SYSTEM = [
  'You grade one reply from a travel guide character against a rubric.',
  'Answer with JSON only: {"pass": true|false, "reason": "<one sentence>"}.',
].join(' ');

async function judge(
  rubric: string,
  output: EvalOutput,
  apiKey: string,
  baseURL: string | undefined,
): Promise<GradeResult> {
  const gateway = createGateway({ apiKey, ...(baseURL === undefined ? {} : { baseURL }) });
  const result = await gateway.callModel('guide.chat_escalation', {
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: `Rubric: ${rubric}\n\nReply:\n${output.text}` }],
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

async function check(
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
    result = await judge(String(assertion.value), output, options.apiKey ?? '', options.baseURL);
  } else {
    result = baseCheck(type, assertion.value, output);
  }
  if (result === undefined) throw new Error(`unsupported assertion type ${assertion.type}`);
  const pass = negated ? !result.pass : result.pass;
  return { type: assertion.type, outcome: pass ? 'pass' : 'fail', reason: result.reason };
}

export async function runSuite(name: string, options: RunOptions): Promise<SuiteReport> {
  const suite = loadSuite(name, options.root);
  const threshold = loadThresholds(options.root)[options.mode][name];
  if (threshold === undefined) throw new Error(`no ${options.mode} threshold for suite ${name}`);
  const cases: CaseReport[] = [];
  for (const testCase of [...suite.cases, ...(options.extraCases ?? [])]) {
    const output = await runCase(testCase.vars, {
      mode: options.mode,
      ...(options.pipeline === undefined ? {} : { pipeline: options.pipeline }),
      ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    });
    const assertions: AssertionReport[] = [];
    for (const assertion of testCase.assert)
      assertions.push(await check(assertion, output, testCase, options));
    const graded = assertions.filter((a) => a.outcome !== 'skipped');
    const outcome =
      graded.length === 0 ? 'skipped' : graded.every((a) => a.outcome === 'pass') ? 'pass' : 'fail';
    cases.push({ description: testCase.description, outcome, assertions });
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
