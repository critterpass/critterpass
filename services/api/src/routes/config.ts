/**
 * `GET /v1/config/bootstrap` (docs/api-contracts.md §5.5): every catalog flag as this account gets
 * it, evaluated in process from PostHog's polled definitions for the caller's pseudonymous id, the
 * same id the server's own gates evaluate. The app reads these values before PostHog's, so a
 * rollout reaches a device whatever its analytics consent, and nothing about the device goes to
 * PostHog for it.
 *
 * It never fails on PostHog's account: unset keys or salt, an outage or a slow first load all
 * answer the catalog defaults, and `source` says so (`defaults`, else `evaluated`), so the app
 * keeps the values it already has instead of switching a rollout off for the length of an outage.
 */
import { resolveFlags, userPid, type FLAG_CATALOG } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import {
  FIRST_LOAD_WAIT_MS,
  processFlagService,
  type FlagAnswer,
  type FlagService,
} from '../obs/flags';

export interface ConfigRouteDeps {
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly flags: FlagService<typeof FLAG_CATALOG>;
  /** `ANALYTICS_PID_SALT`; without a usable one nobody is evaluated and the defaults answer. */
  readonly pidSalt: string | undefined;
  /** How long a request waits for the first definitions load after a deploy. */
  readonly readyTimeoutMs?: number;
}

/** The app asks on session start and on each return to the foreground. */
const CONFIG_PER_UID_RULE = { windowSeconds: 60, max: 30 };

const MIN_SALT_LENGTH = 16;

type Answer = FlagAnswer<typeof FLAG_CATALOG>;
const defaults = (): Answer => ({ flags: resolveFlags(undefined), source: 'defaults' });

async function answerFor(deps: ConfigRouteDeps, uid: string): Promise<Answer> {
  const salt = deps.pidSalt;
  if (salt === undefined || salt.length < MIN_SALT_LENGTH) return defaults();
  try {
    return await deps.flags.answer(
      { distinctId: await userPid(uid, salt) },
      { readyTimeoutMs: deps.readyTimeoutMs ?? FIRST_LOAD_WAIT_MS },
    );
  } catch {
    return defaults();
  }
}

export function registerConfigRoutes(app: OpenAPIHono<AppEnv>, deps: ConfigRouteDeps): void {
  app.get('/v1/config/bootstrap', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'config', uid, CONFIG_PER_UID_RULE);
    c.header('Cache-Control', 'private, no-store');
    const { flags, source } = await answerFor(deps, uid);
    return c.json({ flags, source });
  });
}

/** Mounts the route on the process's one flag service, which starts loading definitions now. */
export function registerConfigRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Pick<ConfigRouteDeps, 'sessions' | 'redis'>,
  env: Readonly<Record<string, string | undefined>>,
): void {
  registerConfigRoutes(app, {
    ...deps,
    flags: processFlagService(env),
    pidSalt: env['ANALYTICS_PID_SALT'],
  });
}
