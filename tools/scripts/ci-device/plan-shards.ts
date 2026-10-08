/**
 * Splits Maestro flows into shards for the device-run workflow's matrices.
 *
 *   tsx tools/scripts/ci-device/plan-shards.ts --platform ios --shards 3 [--flows "e2e/smoke e2e/home"]
 *
 * `--flows` takes repo-root-relative files, directories or globs separated by spaces, commas or
 * newlines; empty means the full suite (every `e2e/<area>/*.yaml` except shared subflows and spikes).
 * Flows named for the other platform (`*-android.yaml` on iOS, `*-ios.yaml` on Android) are dropped.
 * Shards are balanced by time: each flow counts its recorded median minutes (./flow-durations).
 * Prints `{"include":[{"shard":1,"flows":"e2e/a.yaml e2e/b.yaml"}, …]}` and, on GitHub Actions,
 * writes it to the step's `matrix` output along with `count`.
 */
import { appendFileSync, globSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { resolveFlowFiles } from '../capture-app-screens';
import { CliArgsError } from '../e2e-cloud';
import { flowMinutes } from './flow-durations';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const SUITE_EXCLUDED = new Set(['_shared', 'spikes']);
export type DevicePlatform = 'ios' | 'android';

/** Every flow of the full suite, repo-root-relative and sorted. */
export function fullSuite(root: string): string[] {
  return globSync('e2e/*/*.yaml', { cwd: root })
    .filter((file) => !SUITE_EXCLUDED.has(file.split(path.sep)[1] ?? ''))
    .sort();
}

/** Expands the `flows` input into repo-root-relative flow files, in order, for one platform. */
export function selectFlows(input: string, platform: DevicePlatform, root: string): string[] {
  const patterns = input.split(/[\s,]+/).filter(Boolean);
  const expanded = patterns.length
    ? patterns.flatMap((pattern) => {
        if (!/[*?[{]/.test(pattern)) return [path.resolve(root, pattern)];
        const matches = globSync(pattern, { cwd: root }).sort();
        if (matches.length === 0) throw new CliArgsError(`No flows match ${pattern}`);
        return matches.map((match) => path.resolve(root, match));
      })
    : fullSuite(root).map((file) => path.resolve(root, file));
  const other = platform === 'ios' ? '-android' : '-ios';
  return resolveFlowFiles(expanded)
    .map((file) => path.relative(root, file))
    .filter(
      (file) =>
        !path
          .basename(file)
          .replace(/\.ya?ml$/, '')
          .endsWith(other),
    );
}

/** The minutes a shard's flows add up to. */
export function shardMinutes(
  flows: readonly string[],
  minutes: (flow: string) => number = flowMinutes,
): number {
  return flows.reduce((total, flow) => total + minutes(flow), 0);
}

/**
 * Splits the flows into at most `shards` non-empty shards of about equal total time: the longest
 * flow first, each to the shard with the least time so far. A shard keeps its flows in the order
 * they were given.
 */
export function splitShards(
  flows: readonly string[],
  shards: number,
  minutes: (flow: string) => number = flowMinutes,
): string[][] {
  const count = Math.max(1, Math.min(Math.floor(shards), flows.length));
  const out = Array.from({ length: count }, () => ({ total: 0, indexes: [] as number[] }));
  const longestFirst = flows
    .map((flow, index) => ({ index, minutes: minutes(flow) }))
    .sort((a, b) => b.minutes - a.minutes || a.index - b.index);
  for (const { index, minutes: length } of longestFirst) {
    const lightest = out.reduce((best, shard) => (shard.total < best.total ? shard : best));
    lightest.total += length;
    lightest.indexes.push(index);
  }
  return out
    .filter((shard) => shard.indexes.length > 0)
    .map((shard) => shard.indexes.sort((a, b) => a - b).flatMap((index) => flows[index] ?? []));
}

export interface ShardMatrix {
  include: { shard: number; flows: string }[];
}

export function shardMatrix(shards: readonly string[][]): ShardMatrix {
  return { include: shards.map((flows, index) => ({ shard: index + 1, flows: flows.join(' ') })) };
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      platform: { type: 'string' },
      shards: { type: 'string', default: '3' },
      flows: { type: 'string', default: '' },
    },
  });
  const platform = values.platform;
  if (platform !== 'ios' && platform !== 'android') {
    throw new CliArgsError('--platform must be ios or android');
  }
  const flows = selectFlows(values.flows, platform, REPO_ROOT);
  const matrix = shardMatrix(splitShards(flows, Number(values.shards)));
  const json = JSON.stringify(matrix);
  console.log(
    `${platform}: ${String(flows.length)} flow(s) in ${String(matrix.include.length)} shard(s)`,
  );
  for (const { shard, flows: list } of matrix.include) {
    const planned = Math.round(shardMinutes(list.split(' ')));
    console.log(`  shard ${String(shard)} (about ${String(planned)} min of flows): ${list}`);
  }
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `matrix=${json}\ncount=${String(matrix.include.length)}\n`);
  else console.log(json);
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
