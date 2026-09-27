/**
 * End-to-end sync harness: starts the real stack (./stack.ts), runs the scenarios against the app's
 * own local-first client on Node, prints each result and the realtime hint latency p95, and tears
 * everything down. Exits non-zero when a scenario fails or the p95 misses its budget.
 *
 *   pnpm tsx tools/scripts/sync-e2e/run.ts --all
 *   pnpm tsx tools/scripts/sync-e2e/run.ts --scenario offline-replay --scenario reject-mid-batch
 *   pnpm tsx tools/scripts/sync-e2e/run.ts --list
 */
import { parseArgs } from 'node:util';

import { accountSwitch } from './scenarios/account-switch';
import { memberRemoval } from './scenarios/member-removal';
import { offlineReplay } from './scenarios/offline-replay';
import { realtimeFanout } from './scenarios/realtime-fanout';
import { rejectMidBatch } from './scenarios/reject-mid-batch';
import { transientRetry } from './scenarios/transient-retry';
import { composeLogs, startStack } from './stack';
import { percentile, type Scenario } from './support';

/** docs/system-architecture.md §9: a realtime hint reaches every subscriber within 1 s (p95). */
const HINT_P95_BUDGET_MS = 1000;

const SCENARIOS: readonly Scenario[] = [
  offlineReplay,
  rejectMidBatch,
  transientRetry,
  realtimeFanout,
  memberRemoval,
  accountSwitch,
];

/** A scenario that hangs fails the run instead of stalling it. */
const SCENARIO_TIMEOUT_MS = 180_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`scenario timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function selected(values: { all?: boolean; scenario?: string[] }): readonly Scenario[] {
  if (values.all === true) return SCENARIOS;
  const names = values.scenario ?? [];
  const unknown = names.filter((name) => !SCENARIOS.some((scenario) => scenario.name === name));
  if (unknown.length > 0) throw new Error(`unknown scenario: ${unknown.join(', ')}`);
  return SCENARIOS.filter((scenario) => names.includes(scenario.name));
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      all: { type: 'boolean' },
      scenario: { type: 'string', multiple: true },
      list: { type: 'boolean' },
    },
  });
  if (values.list === true) {
    for (const scenario of SCENARIOS) log(`${scenario.name}  ${scenario.description}`);
    return 0;
  }
  const scenarios = selected(values);
  if (scenarios.length === 0) {
    log('usage: run.ts --all | --scenario <name> [--scenario <name>…] | --list');
    return 2;
  }

  const stack = await startStack(log);
  // Ctrl-C or a CI cancel still removes the containers and host processes.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void stack.stop().finally(() => process.exit(130));
    });
  }
  const latencies: number[] = [];
  const failures: string[] = [];
  try {
    for (const scenario of scenarios) {
      const startedAt = performance.now();
      log(`\n▶ ${scenario.name}: ${scenario.description}`);
      try {
        await withTimeout(
          scenario.run({
            stack,
            log: (line) => log(`  ${line}`),
            recordHintLatency: (ms) => latencies.push(ms),
          }),
          SCENARIO_TIMEOUT_MS,
        );
        log(`✔ ${scenario.name} (${Math.round(performance.now() - startedAt)} ms)`);
      } catch (error) {
        failures.push(scenario.name);
        log(`✘ ${scenario.name}: ${error instanceof Error ? error.message : String(error)}`);
        if (!(error instanceof Error) || error.name !== 'ScenarioFailure') {
          log(error instanceof Error ? (error.stack ?? '') : '');
        }
      }
    }
    if (failures.length > 0) {
      for (const service of ['centrifugo', 'powersync']) {
        log(`\n--- ${service} logs ---\n${composeLogs(service)}`);
      }
    }
  } finally {
    await stack.stop();
  }

  log('');
  if (latencies.length > 0) {
    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);
    const within = p95 < HINT_P95_BUDGET_MS;
    log(
      `realtime hint latency over ${latencies.length} deliveries: p50 ${p50.toFixed(0)} ms, ` +
        `p95 ${p95.toFixed(0)} ms (budget < ${HINT_P95_BUDGET_MS} ms) ${within ? 'ok' : 'OVER BUDGET'}`,
    );
    if (!within) failures.push('hint-latency-p95');
  }
  log(
    failures.length === 0
      ? `all ${scenarios.length} scenarios passed`
      : `FAILED: ${failures.join(', ')}`,
  );
  return failures.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exit(1);
  },
);
