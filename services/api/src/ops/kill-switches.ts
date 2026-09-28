/**
 * Kill switches (docs/api-contracts.md §4.17): typed `ops.ops_config` booleans in the `services`
 * group (`ai.<route>.enabled`, `ai.tier.<tier>.enabled`, `signup.enabled`, `otp.<channel>.enabled`,
 * `billing.enabled`, `postcards.enabled`, `la.<kind>.enabled`, `widgets.push.enabled`,
 * `android.fsi.enabled`). A missing key is on. A switched-off feature answers
 * `STATE_INVALID {reason: 'switched_off', key}` (never retryable), and the app shows its existing
 * fallback. An AI route is also off while the cost guard has paused its tier for the day
 * (`ops.ai_cost_guard`); the guard pauses, it never re-routes to another model.
 *
 * Reads are cached for a few seconds per process, so a flip applies within one cache window.
 */
import { resolveRoute } from '@cp/ai';
import { configKey, DomainError, type AiRoute } from '@cp/domain';
import type { MiddlewareHandler } from 'hono';
import type pg from 'pg';

/** The cost guard's state row (written by the worker's `ops.ai_cost_guard` cron). */
export const AI_COST_GUARD_STATE_KEY = 'ops.ai_cost_guard';
const CACHE_MS = 5_000;

export interface KillSwitchOptions {
  readonly now?: () => Date;
  /** A route's billing tier; defaults to the gateway routing table. */
  readonly tierOf?: (route: AiRoute) => string;
}

export interface KillSwitches {
  isOn(key: string): Promise<boolean>;
  /** Throws `STATE_INVALID {reason: 'switched_off', key}` when `key` is off. */
  assertOn(key: string): Promise<void>;
  /** The route's own switch, its tier's switch and the cost guard's pause for today. */
  assertAiRoute(route: AiRoute): Promise<void>;
  /** Hono middleware refusing the request while `key` is off. */
  middleware(key: string): MiddlewareHandler;
}

interface GuardState {
  readonly day?: string;
  readonly paused?: readonly string[];
}

function assertSwitchKey(key: string): void {
  const definition = configKey(key);
  if (definition === undefined || definition.group !== 'services' || !key.endsWith('.enabled')) {
    throw new Error(`${key} is not a kill switch`);
  }
}

function switchedOff(key: string): DomainError {
  return new DomainError('STATE_INVALID', { reason: 'switched_off', key });
}

export function createKillSwitches(pool: pg.Pool, options: KillSwitchOptions = {}): KillSwitches {
  const tierOf = options.tierOf ?? ((route: AiRoute) => resolveRoute(route).tier);
  const now = options.now ?? (() => new Date());
  let cache: { at: number; values: ReadonlyMap<string, unknown> } | null = null;

  async function values(): Promise<ReadonlyMap<string, unknown>> {
    const at = now().getTime();
    if (cache !== null && at - cache.at < CACHE_MS) return cache.values;
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL ROLE app_system');
      const { rows } = await client.query<{ key: string; value: unknown }>(
        `SELECT key, value FROM ops.ops_config
         WHERE (key LIKE '%.enabled' AND key NOT LIKE 'supplier.%') OR key = $1`,
        [AI_COST_GUARD_STATE_KEY],
      );
      await client.query('COMMIT');
      cache = { at, values: new Map(rows.map((row) => [row.key, row.value])) };
      return cache.values;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function isOn(key: string): Promise<boolean> {
    assertSwitchKey(key);
    return (await values()).get(key) !== false;
  }

  async function assertOn(key: string): Promise<void> {
    if (!(await isOn(key))) throw switchedOff(key);
  }

  return {
    isOn,
    assertOn,
    async assertAiRoute(route) {
      await assertOn(`ai.${route}.enabled`);
      const tier = tierOf(route);
      const tierKey = `ai.tier.${tier}.enabled`;
      if (configKey(tierKey) !== undefined) await assertOn(tierKey);
      const guard = (await values()).get(AI_COST_GUARD_STATE_KEY) as GuardState | undefined;
      const today = now().toISOString().slice(0, 10);
      if (guard?.day === today && (guard.paused ?? []).some((p) => p === tier || p === 'all')) {
        throw new DomainError('STATE_INVALID', {
          reason: 'switched_off',
          key: tierKey,
          by: 'cost_guard',
        });
      }
    },
    middleware(key) {
      assertSwitchKey(key);
      return async (_c, next) => {
        await assertOn(key);
        await next();
      };
    },
  };
}
