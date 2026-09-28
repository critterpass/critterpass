/**
 * The kill-switch reader shared by the api and the worker (docs/api-contracts.md §4.17): typed
 * `ops.ops_config` booleans in the `services` group (`ai.<route>.enabled`, `ai.tier.<tier>.enabled`,
 * `signup.enabled`, `otp.<channel>.enabled`, ...). A missing key is on. A switched-off feature
 * answers `STATE_INVALID {reason: 'switched_off', key}` (never retryable). An AI route is also off
 * while the cost guard has paused its tier for the day (`ops.ai_cost_guard`); the guard pauses, it
 * never re-routes to another model.
 *
 * Reads are cached for a few seconds per reader, so a flip applies within one cache window; one
 * reader per process keeps that to one query per window.
 */
import { configKey, switchedOffError, type AiRoute } from '@cp/domain';
import type pg from 'pg';

import { withSystem } from './tx';

/** The cost guard's state row (written by the worker's `ops.ai_cost_guard` cron). */
export const AI_COST_GUARD_STATE_KEY = 'ops.ai_cost_guard';
export const KILL_SWITCH_CACHE_MS = 5_000;

export interface KillSwitchReaderOptions {
  /** A route's billing tier (the gateway routing table). */
  readonly tierOf: (route: AiRoute) => string;
  readonly now?: () => Date;
}

export interface KillSwitchReader {
  readonly isOn: (key: string) => Promise<boolean>;
  /** Throws `STATE_INVALID {reason: 'switched_off', key}` when `key` is off. */
  readonly assertOn: (key: string) => Promise<void>;
  /** The route's own switch, its tier's switch and the cost guard's pause for today. */
  readonly assertAiRoute: (route: AiRoute) => Promise<void>;
}

interface GuardState {
  readonly day?: string;
  readonly paused?: readonly string[];
}

/** Throws unless `key` is a `services` kill switch (`*.enabled`). */
export function assertKillSwitchKey(key: string): void {
  const definition = configKey(key);
  if (definition === undefined || definition.group !== 'services' || !key.endsWith('.enabled')) {
    throw new Error(`${key} is not a kill switch`);
  }
}

export function createKillSwitchReader(
  pool: pg.Pool,
  options: KillSwitchReaderOptions,
): KillSwitchReader {
  const now = options.now ?? (() => new Date());
  let cache: { at: number; values: ReadonlyMap<string, unknown> } | null = null;
  let pending: Promise<ReadonlyMap<string, unknown>> | null = null;

  async function load(at: number): Promise<ReadonlyMap<string, unknown>> {
    const { rows } = await withSystem(pool, (tx) =>
      tx.query<{ key: string; value: unknown }>(
        `SELECT key, value FROM ops.ops_config
         WHERE (key LIKE '%.enabled' AND key NOT LIKE 'supplier.%') OR key = $1`,
        [AI_COST_GUARD_STATE_KEY],
      ),
    );
    cache = { at, values: new Map(rows.map((row) => [row.key, row.value])) };
    return cache.values;
  }

  function values(): Promise<ReadonlyMap<string, unknown>> {
    const at = now().getTime();
    if (cache !== null && at - cache.at < KILL_SWITCH_CACHE_MS)
      return Promise.resolve(cache.values);
    // Concurrent misses share one read.
    pending ??= load(at).finally(() => {
      pending = null;
    });
    return pending;
  }

  async function isOn(key: string): Promise<boolean> {
    assertKillSwitchKey(key);
    return (await values()).get(key) !== false;
  }

  async function assertOn(key: string): Promise<void> {
    if (!(await isOn(key))) throw switchedOffError(key);
  }

  return {
    isOn,
    assertOn,
    async assertAiRoute(route) {
      await assertOn(`ai.${route}.enabled`);
      const tier = options.tierOf(route);
      const tierKey = `ai.tier.${tier}.enabled`;
      if (configKey(tierKey) !== undefined) await assertOn(tierKey);
      const guard = (await values()).get(AI_COST_GUARD_STATE_KEY) as GuardState | undefined;
      const today = now().toISOString().slice(0, 10);
      if (guard?.day === today && (guard.paused ?? []).some((p) => p === tier || p === 'all')) {
        throw switchedOffError(tierKey, { by: 'cost_guard' });
      }
    },
  };
}
