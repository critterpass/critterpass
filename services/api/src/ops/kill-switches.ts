/**
 * Kill switches for api routes (docs/api-contracts.md §4.17): the shared `@cp/db` reader with the
 * gateway routing table as its tier source, plus Hono middleware that refuses a request while its
 * switch is off (`STATE_INVALID {reason: 'switched_off', key}`, never retryable; the app shows its
 * existing fallback). Build one per process so every call shares its short read cache.
 */
import { resolveRoute } from '@cp/ai';
import { assertKillSwitchKey, createKillSwitchReader, type KillSwitchReader } from '@cp/db';
import type { AiRoute } from '@cp/domain';
import type { MiddlewareHandler } from 'hono';
import type pg from 'pg';

export { AI_COST_GUARD_STATE_KEY } from '@cp/db';

export interface KillSwitchOptions {
  readonly now?: () => Date;
  /** A route's billing tier; defaults to the gateway routing table. */
  readonly tierOf?: (route: AiRoute) => string;
}

export interface KillSwitches extends KillSwitchReader {
  /** Hono middleware refusing the request while `key` is off. */
  middleware(key: string): MiddlewareHandler;
}

export function createKillSwitches(pool: pg.Pool, options: KillSwitchOptions = {}): KillSwitches {
  const reader = createKillSwitchReader(pool, {
    tierOf: options.tierOf ?? ((route) => resolveRoute(route).tier),
    ...(options.now === undefined ? {} : { now: options.now }),
  });
  return {
    ...reader,
    middleware(key) {
      assertKillSwitchKey(key);
      return async (_c, next) => {
        await reader.assertOn(key);
        await next();
      };
    },
  };
}
