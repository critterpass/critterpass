/**
 * `pnpm --filter @cp/ai eval <suite...> | --all | --changed <git ref>`
 *
 * Replay mode (default, CI): recorded responses, deterministic graders. Live mode
 * (`EVAL_MODE=live` with the DeepSeek key in `ANTHROPIC_API_KEY`): the same cases against
 * DeepSeek, with `llm-rubric` judged too; `TAVILY_API_KEY` runs web search cases against Tavily and
 * `EVAL_RECORD=1` stores the responses as the replay recordings. Exits non-zero when any suite
 * scores below its threshold.
 */
import { execFileSync } from 'node:child_process';

import { DEEPSEEK_ANTHROPIC_URL } from '../src/env';
import { runSuite, type SuiteReport } from './lib/runner';
import { isSuiteName, SUITES, suitesForChanges, type SuiteName } from './suites';

function selected(args: readonly string[]): SuiteName[] {
  if (args.includes('--all') || args.length === 0) return [...SUITES];
  const changed = args.indexOf('--changed');
  if (changed !== -1) {
    const base = args[changed + 1];
    if (base === undefined) throw new Error('--changed needs a git ref');
    const diff = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      encoding: 'utf8',
    });
    return suitesForChanges(diff.split('\n').filter(Boolean));
  }
  const unknown = args.filter((arg) => !isSuiteName(arg));
  if (unknown.length > 0)
    throw new Error(`unknown suite(s): ${unknown.join(', ')}; known: ${SUITES.join(', ')}`);
  return args.filter(isSuiteName);
}

function print(report: SuiteReport): void {
  const verdict = report.ok ? 'PASS' : 'FAIL';
  console.log(
    `${verdict} ${report.suite} (${report.mode}): ${report.passed}/${report.graded} = ${report.score.toFixed(2)}, threshold ${report.threshold}`,
  );
  for (const metric of report.metrics ?? []) {
    console.log(
      `  ${metric.ok ? 'ok  ' : 'FAIL'} ${metric.name} [${metric.lang}] ${metric.value.toFixed(2)} (n=${metric.n}, target ${metric.target})`,
    );
  }
  if (report.latency) {
    console.log(
      `  jev latency p50 ${Math.round(report.latency.p50)} ms, p95 ${Math.round(report.latency.p95)} ms (n=${report.latency.n})`,
    );
  }
  for (const testCase of report.cases) {
    if (testCase.outcome === 'pass') continue;
    console.log(`  ${testCase.outcome.toUpperCase()} ${testCase.description}`);
    for (const a of testCase.assertions.filter((entry) => entry.outcome !== 'pass')) {
      console.log(`    ${a.outcome} ${a.type}: ${a.reason}`);
    }
    if (testCase.output !== undefined)
      console.log(`    output: ${JSON.stringify(testCase.output)}`);
  }
}

async function main(): Promise<void> {
  const mode = process.env.EVAL_MODE === 'live' ? 'live' : 'replay';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const typesafeKey = process.env.TYPESAFE_API_KEY;
  const searchKey = process.env.TAVILY_API_KEY;
  const suites = selected(process.argv.slice(2));
  const generationSuites = suites.filter((suite) => suite !== 'compliance');
  if (mode === 'live' && generationSuites.length > 0 && !apiKey) {
    throw new Error('EVAL_MODE=live needs ANTHROPIC_API_KEY (the DeepSeek key)');
  }
  // Only an explicitly named endpoint replaces DeepSeek's (never an ambient ANTHROPIC_BASE_URL).
  const baseURL =
    mode === 'live' && process.env.EVAL_BASE_URL ? process.env.EVAL_BASE_URL : undefined;
  if (mode === 'live') {
    console.log(`live against ${new URL(baseURL ?? DEEPSEEK_ANTHROPIC_URL).host}`);
    if (!searchKey) console.log('TAVILY_API_KEY unset: web search cases answer without search');
  }
  if (suites.length === 0) {
    console.log('no eval suite is affected by these changes');
    return;
  }
  let failed = false;
  for (const suite of suites) {
    const report = await runSuite(suite, {
      mode,
      ...(apiKey ? { apiKey } : {}),
      ...(typesafeKey ? { typesafeKey } : {}),
      ...(searchKey ? { searchKey } : {}),
      ...(process.env.EVAL_RECORD === '1' ? { record: true } : {}),
      ...(baseURL === undefined ? {} : { baseURL }),
    });
    print(report);
    failed ||= !report.ok;
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
