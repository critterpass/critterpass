/** Shared pieces of the harness scenarios: the scenario shape, waits, checks and server reads. */
import { crewChannel } from '@cp/domain';

import type { Stack } from './stack';

export interface ScenarioContext {
  readonly stack: Stack;
  readonly log: (line: string) => void;
  /** Records one realtime hint latency sample (ms from send to receipt). */
  readonly recordHintLatency: (ms: number) => void;
}

export interface Scenario {
  /** Kebab-case id used by `--scenario`. */
  readonly name: string;
  readonly description: string;
  run(context: ScenarioContext): Promise<void>;
}

export class ScenarioFailure extends Error {
  override readonly name = 'ScenarioFailure';
}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ScenarioFailure(message);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `probe` every 50 ms until it returns true; fails with `label` after `timeoutMs`. */
export async function waitFor(
  probe: () => Promise<boolean> | boolean,
  label: string,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probe()) return;
    if (Date.now() > deadline)
      throw new ScenarioFailure(`timed out after ${timeoutMs} ms: ${label}`);
    await sleep(50);
  }
}

/** Nearest-rank percentile of `samples` (0 < p ≤ 100). */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? Number.NaN;
}

export async function scalar(stack: Stack, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await stack.pool.query<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

/** Server-side executions per op: one `cmd_log` row each, whatever the client resent. */
export function commandLogCount(stack: Stack, uid: string): Promise<number> {
  return scalar(stack, 'SELECT count(*) AS n FROM cmd_log WHERE uid = $1', [uid]);
}

/**
 * How many times each crew's creating handler ran: every run queues one `crew.created` hint in its
 * own transaction, so a replayed op that slipped past idempotency would show up here as 2.
 */
export async function crewCreatedHints(
  stack: Stack,
  crewIds: readonly string[],
): Promise<Map<string, number>> {
  const { rows } = await stack.pool.query<{ channel: string; n: string }>(
    `SELECT channel, count(*) AS n FROM rt_outbox
      WHERE kind = 'publish' AND payload->>'type' = 'crew.created' AND channel = ANY($1)
      GROUP BY channel`,
    [crewIds.map(crewChannel)],
  );
  const byChannel = new Map(rows.map((row) => [row.channel, Number(row.n)]));
  return new Map(crewIds.map((id) => [id, byChannel.get(crewChannel(id)) ?? 0]));
}

export function everyOnce(counts: Map<string, number>): boolean {
  return [...counts.values()].every((count) => count === 1);
}
