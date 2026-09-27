/**
 * `pnpm --filter @cp/ai eval <suite...> | --all | --changed <git ref>`
 *
 * Replay mode (default, CI): recorded responses, deterministic graders. Live mode
 * (`EVAL_MODE=live` with a Claude `ANTHROPIC_API_KEY`): the same cases against Anthropic's API,
 * with `llm-rubric` judged too. Exits non-zero when any suite scores below its threshold.
 */
import { execFileSync } from 'node:child_process';

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
  for (const testCase of report.cases) {
    if (testCase.outcome === 'pass') continue;
    console.log(`  ${testCase.outcome.toUpperCase()} ${testCase.description}`);
    for (const a of testCase.assertions.filter((entry) => entry.outcome !== 'pass')) {
      console.log(`    ${a.outcome} ${a.type}: ${a.reason}`);
    }
  }
}

async function main(): Promise<void> {
  const mode = process.env.EVAL_MODE === 'live' ? 'live' : 'replay';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (mode === 'live' && !apiKey) throw new Error('EVAL_MODE=live needs ANTHROPIC_API_KEY');
  // Only an explicitly named endpoint is graded instead of Anthropic's API (never ANTHROPIC_BASE_URL).
  const baseURL =
    mode === 'live' && process.env.EVAL_BASE_URL ? process.env.EVAL_BASE_URL : undefined;
  if (mode === 'live')
    console.log(`live against ${baseURL ? new URL(baseURL).host : 'api.anthropic.com'}`);
  const suites = selected(process.argv.slice(2));
  if (suites.length === 0) {
    console.log('no eval suite is affected by these changes');
    return;
  }
  let failed = false;
  for (const suite of suites) {
    const report = await runSuite(suite, {
      mode,
      ...(apiKey ? { apiKey } : {}),
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
