/**
 * The findings of a device run, as markdown for the pull request (or nightly issue) comment.
 *
 *   tsx tools/scripts/ci-device/run-summary.ts <shards dir> [--coverage] [--out summary.md]
 *
 * Reads every downloaded shard artifact (`device-<platform>-shard-<n>/`): the flows that failed
 * (their JUnit reports), the screen-check findings (`screen-checks.log`) and the app's `[ui-qa]`
 * reports (`ui-qa.log`). With --coverage, appends the sweep coverage report.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { coverage, formatCoverage } from './sweep-coverage';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

export interface ShardFindings {
  readonly shard: string;
  readonly failedFlows: string[];
  readonly screenChecks: string[];
  readonly uiQa: string[];
}

function lines(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

export function readShard(dir: string): ShardFindings {
  const junit = path.join(dir, 'junit');
  const failedFlows = existsSync(junit)
    ? readdirSync(junit)
        .filter((file) => file.endsWith('.xml'))
        .filter((file) => /<(failure|error)\b/.test(readFileSync(path.join(junit, file), 'utf8')))
        .map((file) => file.replace(/\.xml$/, '').replace(/__/g, '/'))
        .sort()
    : [];
  return {
    shard: path.basename(dir).replace(/^device-/, ''),
    failedFlows,
    screenChecks: lines(path.join(dir, 'screen-checks.log')),
    uiQa: lines(path.join(dir, 'ui-qa.log')),
  };
}

export function readShards(root: string): ShardFindings[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.startsWith('device-') && name.includes('-shard-'))
    .sort()
    .map((name) => readShard(path.join(root, name)));
}

export function formatSummary(shards: readonly ShardFindings[]): string {
  const failed = shards.flatMap((s) => s.failedFlows.map((flow) => `${flow} (${s.shard})`));
  const checks = shards.flatMap((s) => s.screenChecks);
  const uiQa = shards.flatMap((s) => s.uiQa);
  const block = (items: readonly string[]) => ['```', ...items, '```'].join('\n');
  const out = ['### Checks', ''];
  if (failed.length + checks.length + uiQa.length === 0) {
    out.push('Every flow passed, with no screen-check findings and no `[ui-qa]` reports.', '');
    return out.join('\n');
  }
  out.push(
    `- Flows failed: **${String(failed.length)}**`,
    `- Screen-check findings (SCREEN_FRAME, KEYBOARD_BAND, EMPTY_SCREEN): **${String(checks.length)}**`,
    `- \`[ui-qa]\` report lines: **${String(uiQa.length)}**`,
    '',
  );
  if (failed.length) out.push('**Failed flows**', '', ...failed.map((f) => `- \`${f}\``), '');
  if (checks.length) out.push('**Screen checks**', '', block(checks), '');
  if (uiQa.length) out.push('**`[ui-qa]` reports**', '', block(uiQa), '');
  return out.join('\n');
}

function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    allowPositionals: true,
    options: { coverage: { type: 'boolean', default: false }, out: { type: 'string' } },
  });
  const root = positionals[0];
  if (!root) throw new Error('Usage: run-summary <shards dir> [--coverage] [--out file]');
  let text = formatSummary(readShards(path.resolve(root)));
  if (values.coverage) text += `\n${formatCoverage(coverage(REPO_ROOT))}`;
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
