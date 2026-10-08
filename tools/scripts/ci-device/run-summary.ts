/**
 * The findings of a device run, as markdown for the pull request (or nightly issue) comment.
 *
 *   tsx tools/scripts/ci-device/run-summary.ts <shards dir> [--coverage] [--out summary.md]
 *
 * Reads every downloaded shard artifact (`device-<platform>-shard-<n>/`): the flows that failed,
 * timed out or passed only on their retry (their JUnit reports, ./flow-attempts), the screen-check
 * findings (`screen-checks.log`) and the app's `[ui-qa]`
 * reports (`ui-qa.log`). With --coverage, appends the sweep coverage report. A run that planned
 * UI sweep flows also gets the sweep's count of screenshots not captured and its verdict
 * (./sweep-result); a red verdict is written to the step's `sweep_red` output.
 *
 * A shard that stops before its flows (the emulator never installed, the app crashed on launch)
 * uploads no report, and often no artifact at all. So the summary is checked against the plan: the
 * prepare job's shard matrices, read from IOS_MATRIX and ANDROID_MATRIX. A planned flow with no
 * report has no result, and is listed as such instead of being counted among the flows that passed.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { reportedOutcome } from './flow-attempts';
import type { ShardMatrix } from './plan-shards';
import { coverage, formatCoverage } from './sweep-coverage';
import { formatSweepResult, readSweepFiles, sweepResult, sweepVerdict } from './sweep-result';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

export interface ShardFindings {
  readonly shard: string;
  /** How many flows left a JUnit report. */
  readonly ran: number;
  /** Flows that failed or timed out. */
  readonly failedFlows: string[];
  /** The failed flows that were stopped at the flow time limit. */
  readonly timedOut: string[];
  /** Flows whose first run failed and second passed: flaky, and kept visible. */
  readonly retried: string[];
  /** Planned flows with no report: the shard stopped before them, or Maestro wrote none. */
  readonly notRun: string[];
  readonly screenChecks: string[];
  readonly uiQa: string[];
}

/** The flows each shard was to run, by shard (`android-shard-2`), named like their reports. */
export type ShardPlan = ReadonlyMap<string, readonly string[]>;

/** A flow as its JUnit report names it: `e2e/happy/money.yaml` and `e2e__happy__money.xml` alike. */
function flowName(file: string): string {
  return file.replace(/\.(xml|ya?ml)$/, '').replace(/__/g, '/');
}

/** The plan from the prepare job's matrices, one JSON string per platform that ran. */
export function shardPlan(matrices: Readonly<Record<string, string | undefined>>): ShardPlan {
  const plan = new Map<string, string[]>();
  for (const [platform, json] of Object.entries(matrices)) {
    if (!json) continue;
    for (const { shard, flows } of (JSON.parse(json) as ShardMatrix).include)
      plan.set(
        `${platform}-shard-${String(shard)}`,
        flows.split(/\s+/).filter(Boolean).map(flowName),
      );
  }
  return plan;
}

function lines(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function readShard(dir: string, planned: readonly string[] = []): ShardFindings {
  const junit = path.join(dir, 'junit');
  const reports = existsSync(junit) ? readdirSync(junit).filter((f) => f.endsWith('.xml')) : [];
  const ran = new Set(reports.map(flowName));
  const outcomes = reports.map((file) => ({
    flow: flowName(file),
    outcome: reportedOutcome(readFileSync(path.join(junit, file), 'utf8')).outcome,
  }));
  const withOutcome = (...wanted: string[]) =>
    outcomes
      .filter(({ outcome }) => wanted.includes(outcome))
      .map(({ flow }) => flow)
      .sort();
  return {
    shard: path.basename(dir).replace(/^device-/, ''),
    ran: ran.size,
    failedFlows: withOutcome('failed', 'timed out'),
    timedOut: withOutcome('timed out'),
    retried: withOutcome('passed on retry'),
    notRun: planned.filter((flow) => !ran.has(flow)),
    screenChecks: lines(path.join(dir, 'screen-checks.log')),
    uiQa: lines(path.join(dir, 'ui-qa.log')),
  };
}

/** Every shard that uploaded an artifact and every planned shard, uploaded or not. */
export function readShards(root: string, plan: ShardPlan = new Map()): ShardFindings[] {
  const uploaded = existsSync(root)
    ? readdirSync(root).filter((name) => name.startsWith('device-') && name.includes('-shard-'))
    : [];
  const planned = [...plan.keys()].map((shard) => `device-${shard}`);
  return [...new Set([...uploaded, ...planned])]
    .sort()
    .map((name) => readShard(path.join(root, name), plan.get(name.replace(/^device-/, ''))));
}

export function formatSummary(shards: readonly ShardFindings[]): string {
  const failed = shards.flatMap((s) =>
    s.failedFlows.map(
      (flow) => `${flow} (${s.shard}${s.timedOut.includes(flow) ? ', timed out' : ''})`,
    ),
  );
  const retried = shards.flatMap((s) => s.retried.map((flow) => `${flow} (${s.shard})`));
  // Without a plan, a shard that ran nothing is all that is known of its flows.
  const noResult = shards.flatMap((s) =>
    s.notRun.length > 0
      ? s.notRun.map((flow) => `${flow} (${s.shard})`)
      : s.ran === 0
        ? [`every flow of ${s.shard}`]
        : [],
  );
  const checks = shards.flatMap((s) => s.screenChecks);
  const uiQa = shards.flatMap((s) => s.uiQa);
  const block = (items: readonly string[]) => ['```', ...items, '```'].join('\n');
  const list = (items: readonly string[]) => items.map((item) => `- \`${item}\``);
  const out = ['### Checks', ''];
  if (!shards.some((s) => s.ran > 0)) {
    out.push(
      '**No flow ran.** Every shard stopped before its first flow (the emulator or simulator, the install or the launch): the failed jobs of the run say why.',
      '',
    );
    if (noResult.length) out.push('**No result**', '', ...list(noResult), '');
    return out.join('\n');
  }
  if (failed.length + retried.length + noResult.length + checks.length + uiQa.length === 0) {
    out.push('Every flow passed, with no screen-check findings and no `[ui-qa]` reports.', '');
    return out.join('\n');
  }
  out.push(
    `- Flows failed: **${String(failed.length)}**`,
    ...(retried.length
      ? [`- Flows passed on retry (the first run failed): **${String(retried.length)}**`]
      : []),
    ...(noResult.length
      ? [`- Flows with no result (their shard stopped first): **${String(noResult.length)}**`]
      : []),
    `- Screen-check findings (SCREEN_FRAME, KEYBOARD_BAND, EMPTY_SCREEN): **${String(checks.length)}**`,
    `- \`[ui-qa]\` report lines: **${String(uiQa.length)}**`,
    '',
  );
  if (failed.length) out.push('**Failed flows**', '', ...list(failed), '');
  if (retried.length) out.push('**Passed on retry**', '', ...list(retried), '');
  if (noResult.length) out.push('**No result**', '', ...list(noResult), '');
  if (checks.length) out.push('**Screen checks**', '', block(checks), '');
  if (uiQa.length) out.push('**`[ui-qa]` reports**', '', block(uiQa), '');
  return out.join('\n');
}

/**
 * The UI sweep's own count and verdict (./sweep-result), when the run planned sweep flows: the
 * screenshots of the manifest each shard was to take against the ones it uploaded.
 */
export function sweepSection(
  root: string,
  shards: readonly ShardFindings[],
  plan: ShardPlan,
): { text: string; reasons: string[] } | undefined {
  const result = sweepResult(
    shards.map((shard) => ({
      shard: shard.shard,
      planned: plan.get(shard.shard) ?? [],
      failedFlows: shard.failedFlows,
      ...readSweepFiles(path.join(root, `device-${shard.shard}`)),
    })),
  );
  if (!result) return undefined;
  const reasons = sweepVerdict(result, {
    screenChecks: shards.reduce((sum, shard) => sum + shard.screenChecks.length, 0),
    uiQa: shards.reduce((sum, shard) => sum + shard.uiQa.length, 0),
  });
  return { text: formatSweepResult(result, reasons), reasons };
}

/** The plan this run's prepare job made, when the workflow passes it. */
export function planFromEnv(env: NodeJS.ProcessEnv = process.env): ShardPlan {
  return shardPlan({ ios: env.IOS_MATRIX, android: env.ANDROID_MATRIX });
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: { coverage: { type: 'boolean', default: false }, out: { type: 'string' } },
  });
  const root = positionals[0];
  if (!root) throw new Error('Usage: run-summary <shards dir> [--coverage] [--out file]');
  const shards = readShards(path.resolve(root), planFromEnv());
  let text = formatSummary(shards);
  const sweep = sweepSection(path.resolve(root), shards, planFromEnv());
  if (sweep) text += `\n${sweep.text}`;
  if (values.coverage) text += `\n${formatCoverage(coverage(REPO_ROOT))}`;
  // The publish job reads this after it has posted the summary, and fails on it.
  if (sweep && sweep.reasons.length > 0 && process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `sweep_red=${sweep.reasons.join('; ')}\n`);
  if (values.out) writeFileSync(values.out, text);
  else console.log(text);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
