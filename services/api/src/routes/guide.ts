/**
 * Guide routes (docs/api-contracts.md §5.3): `POST /v1/guide/threads/{id}/turns` streams one guide
 * sheet turn (SSE) on the free meter, and the `guide_thread:{id}` realtime namespace carries a
 * group thread's tokens to the trip's crew. The guide's tools are the api's executors plus the
 * guide area's own (crew profiles, plan, phrase cards); web search runs where the route enables it.
 * Crew-chat mentions are answered by the worker's `ai.guide_mention` job, streamed on
 * `crew_chat:{crew_id}`.
 */
import { createGateway, createToolRegistry, recordUsage, searchProviderFromEnv } from '@cp/ai';
import { withSystem } from '@cp/db';
import { DomainError, guideTurnBodySchema } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { createApiCompliance } from '../ai/compliance';
import { deviceTzFrom } from '../ai/sse-route-helper';
import { registerApiToolExecutors } from '../ai/tool-executors';
import { validationHook, type CommandDoorDeps } from '../commands/_framework/doors';
import { enforceUidRateLimit, requireCommandSession } from '../commands/_framework/session';
import { registerGuideToolExecutors } from '../commands/guide/tools';
import { streamThreadTurn, type GuideTurnDeps } from '../commands/guide/turn';
import type { ApiEnv } from '../env';
import { createKillSwitches } from '../ops/kill-switches';
import { aclForSql, getNamespace, registerNamespace } from '../realtime/namespaces';

/** A question every few seconds is a person; more is a runaway client. */
const TURNS_PER_UID_RULE = { windowSeconds: 60, max: 20 };

// A group thread's live tokens: anyone who can read the thread (RLS: the trip's crew).
if (getNamespace('guide_thread') === undefined) {
  registerNamespace({
    name: 'guide_thread',
    acl: aclForSql(
      "SELECT EXISTS (SELECT 1 FROM guide_threads WHERE id = $1::uuid AND mode = 'group') AS allowed",
    ),
    presence: false,
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new DomainError('VALIDATION', {
      issues: [{ path: [], code: 'invalid_json', message: 'The body is not JSON' }],
    });
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  validationHook(parsed);
  return parsed.data as T;
}

export interface GuideRouteDeps extends Pick<CommandDoorDeps, 'pool' | 'sessions' | 'redis'> {
  readonly turn: Omit<GuideTurnDeps, 'pool'>;
  /** Turns per uid per minute (default 20). */
  readonly turnsPerMinute?: number;
}

export function registerGuideTurnRoute(app: OpenAPIHono<AppEnv>, deps: GuideRouteDeps): void {
  app.post('/v1/guide/threads/:id/turns', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    await enforceUidRateLimit(deps.redis, 'guide_turns', uid, {
      ...TURNS_PER_UID_RULE,
      max: deps.turnsPerMinute ?? TURNS_PER_UID_RULE.max,
    });
    const threadId = parse(z.uuid(), c.req.param('id'));
    const body = parse(guideTurnBodySchema, await readJson(c.req.raw));
    return streamThreadTurn(
      { ...deps.turn, pool: deps.pool },
      {
        uid,
        device: c.req.header('x-cp-device') ?? 'unknown',
        deviceTz: deviceTzFrom(c.req.raw.headers),
        threadId,
        body,
      },
    );
  });
}

/**
 * Boot wiring: the guide needs a model key (`ANTHROPIC_API_KEY`, the DeepSeek key); without one the
 * turn route is not mounted and the app shows the guide as unavailable.
 */
export function registerGuideRoutes(
  app: OpenAPIHono<AppEnv>,
  doors: CommandDoorDeps & { readonly logger: GuideTurnDeps['logger'] },
  env: Pick<ApiEnv, 'ANTHROPIC_API_KEY' | 'ANTHROPIC_BASE_URL' | 'TYPESAFE_API_KEY'>,
): void {
  if (env.ANTHROPIC_API_KEY === undefined) {
    doors.logger.warn('Guide turns are disabled: ANTHROPIC_API_KEY is unset');
    return;
  }
  const switches = createKillSwitches(doors.pool);
  const gateway = createGateway({
    apiKey: env.ANTHROPIC_API_KEY,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    assertRouteOn: switches.assertAiRoute,
    onUsage: (record) => recordUsage((fn) => withSystem(doors.pool, fn), record),
  });
  const registry = createToolRegistry((name, error) =>
    doors.logger.warn({ tool: name, err: error }, 'guide tool executor failed'),
  );
  registerApiToolExecutors(registry, doors.pool, {
    search: searchProviderFromEnv(),
    logger: doors.logger,
  });
  registerGuideToolExecutors(registry, doors.pool);
  const compliance = createApiCompliance({
    pool: doors.pool,
    typesafeApiKey: env.TYPESAFE_API_KEY,
    gateway,
    switches,
    logger: doors.logger,
  });
  registerGuideTurnRoute(app, {
    pool: doors.pool,
    sessions: doors.sessions,
    redis: doors.redis,
    turn: { gateway, switches, registry, compliance, logger: doors.logger },
  });
}
