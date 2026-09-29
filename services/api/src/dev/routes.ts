/**
 * `POST /v1/dev/seed-demo`: gives the signed-in caller (anonymous included) a realistic demo world
 * on staging so device testing never lands on empty states: a crew with four fake crewmates, a
 * confirmed trip three weeks out, a started plan, chat, a tip and an inbox for the chosen
 * scenario (`{"scenario": "everyday" | "inbox" | "caught_up"}`, default `everyday`).
 *
 * Mounted only when APP_ENV is not production and DEV_SEED_ENABLED is on; the handler refuses on
 * production again whatever mounted it. Idempotent: the crew and trip are built once per caller,
 * and every call resets the inbox, tip, nudges and undo window to the scenario's state.
 */
import { DomainError } from '@cp/domain';
import { withSystem } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import type { Logger } from 'pino';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { AppEnv } from '../app';
import {
  enforceUidRateLimit,
  requireCommandSession,
  type SessionResolver,
} from '../commands/_framework/session';
import { demoScenarioSchema, resetDemoInbox } from './demo-inbox';
import { ensureUndoableGuideAction } from './demo-plan';
import { ensureDemoWorld } from './demo-world';

export interface DevRouteDeps {
  readonly appEnv: 'local' | 'staging' | 'production';
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
  readonly redis: RateLimitRedisClient;
  readonly logger: Pick<Logger, 'info' | 'warn'>;
  readonly clock?: () => Date;
}

const bodySchema = z.object({ scenario: demoScenarioSchema.default('everyday') }).strict();

/** A reseed per flow run is plenty; this only stops a runaway loop. */
const SEED_PER_UID_RULE = { windowSeconds: 60, max: 10 };

export interface SeedDemoResult {
  readonly crew_id: string;
  readonly trip_id: string;
  readonly scenario: z.infer<typeof demoScenarioSchema>;
  readonly created: boolean;
  /** The fresh inbox items, so a client can wait until sync has delivered them. */
  readonly inbox_item_ids: readonly string[];
}

/** Builds (or resets) the caller's demo world in one system transaction. */
export async function seedDemoFor(
  pool: pg.Pool,
  uid: string,
  scenario: z.infer<typeof demoScenarioSchema>,
  now: Date,
): Promise<SeedDemoResult> {
  return withSystem(pool, async (tx) => {
    const world = await ensureDemoWorld(tx, uid, now);
    const guideAction = await ensureUndoableGuideAction(tx, world, uid, now);
    const items = await resetDemoInbox(tx, world, uid, scenario, guideAction, now);
    return {
      crew_id: world.crewId,
      trip_id: world.tripId,
      scenario,
      created: world.created,
      inbox_item_ids: items,
    };
  });
}

export function registerDevRoutes(app: OpenAPIHono<AppEnv>, deps: DevRouteDeps): void {
  app.post('/v1/dev/seed-demo', async (c) => {
    if (deps.appEnv === 'production') {
      throw new DomainError('FORBIDDEN', { reason: 'not_in_production' });
    }
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'dev_seed', uid, SEED_PER_UID_RULE);
    const raw: unknown = await c.req.json().catch(() => ({}));
    const { scenario } = bodySchema.parse(raw ?? {});
    const result = await seedDemoFor(deps.pool, uid, scenario, deps.clock?.() ?? new Date());
    deps.logger.info({ scenario, created: result.created }, 'demo world seeded');
    return c.json(result);
  });
}

/** Mounts the seed route only outside production and only when the flag is on. */
export function registerDevRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  deps: Omit<DevRouteDeps, 'appEnv'>,
  env: { readonly APP_ENV: DevRouteDeps['appEnv']; readonly DEV_SEED_ENABLED: boolean },
): boolean {
  if (env.APP_ENV === 'production' || !env.DEV_SEED_ENABLED) return false;
  registerDevRoutes(app, { ...deps, appEnv: env.APP_ENV });
  deps.logger.warn('POST /v1/dev/seed-demo is mounted (DEV_SEED_ENABLED)');
  return true;
}
