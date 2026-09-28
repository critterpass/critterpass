/**
 * `/v1/admin/*` (docs/api-contracts.md §5.9): the console's own Better Auth endpoints, `/me`, the
 * registry's reads and `POST /cmd/{cmd}`, all behind `adminGuard`. A separate Hono app mounted by
 * delegation, so its routes stay out of the public `/openapi.json`; its own document is served at
 * `/v1/admin/openapi.json` to signed-in operators only.
 */
import { DomainError, adminMeSchema, canOpenAdminArea, openableAdminAreas } from '@cp/domain';
import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { RequestIdVariables } from 'hono/request-id';
import type pg from 'pg';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

import type { AppEnv } from '../app';
import type { RateLimitRedisClient } from '../abuse/rate-limits';
import { outcomeBody } from '../commands/_framework/doors';
import type { AccessVerifier } from './access';
import type { AdminAllowlist } from './allowlist';
import { ADMIN_AUTH_BASE_PATH, type AdminAuth } from './auth';
import { adminGuard, type AdminVariables } from './auth-guard';
import { runAdminCommand } from './command';
import { countsArea } from './counts';
import { jobsArea, type JobsPanelDeps } from './jobs';
import { webhookReplayArea } from './webhook-replay';
import { deskQueueArea, workArea } from './work';
import {
  createAdminRegistry,
  type AdminRegistry,
  type AdminAreaDefinition,
  type AnyAdminRead,
  type OperatorDirectory,
} from './registry';

export const ADMIN_BASE_PATH = '/v1/admin';

/** The only Better Auth endpoints the console uses; the rest (admin plugin API included) are 404. */
const AUTH_PATHS = [
  /^\/sign-in\/social$/,
  /^\/callback\/[a-z]+$/,
  /^\/sign-out$/,
  /^\/dev\/sign-in$/,
];

export interface AdminRouterDeps {
  readonly pool: pg.Pool;
  readonly redis: RateLimitRedisClient;
  readonly logger: Pick<Logger, 'error'>;
  readonly auth: AdminAuth;
  readonly allowlist: AdminAllowlist;
  readonly access?: AccessVerifier | undefined;
  readonly ipHashSecret: string;
  /** Enables the emergency CLI door (owner tokens signed with this secret). */
  readonly cliTokenSecret?: string | undefined;
  readonly areas: readonly AdminAreaDefinition[];
  /** The jobs panel's pg-boss producer and heartbeat reader; the panel is absent without them. */
  readonly jobs?: Omit<JobsPanelDeps, 'pool'> | undefined;
  readonly now?: () => Date;
}

type AdminEnv = { Variables: RequestIdVariables & AdminVariables };

function errorBody(code: string, message: string, retryable: boolean) {
  return { error: { code, message, retryable } };
}

const toHonoPath = (path: string) => path.replaceAll(/\{([a-z_]+)\}/g, ':$1');

function registerRead(
  app: OpenAPIHono<AdminEnv>,
  read: AnyAdminRead,
  operators: OperatorDirectory,
): void {
  const path = `${ADMIN_BASE_PATH}${read.path}`;
  app.openAPIRegistry.registerPath({
    method: 'get',
    path,
    tags: ['admin'],
    summary: read.summary,
    responses: {
      200: {
        description: read.summary,
        content: { 'application/json': { schema: read.response } },
      },
    },
  });
  app.get(toHonoPath(path), async (c) => {
    const admin = c.var.admin;
    const decision = canOpenAdminArea(admin.roles, read.area);
    if (!decision.ok) throw new DomainError(decision.deny, { reason: 'role' });
    const query = read.query === undefined ? {} : read.query.parse(c.req.query());
    const params = read.params === undefined ? {} : read.params.parse(c.req.param());
    return c.json((await read.run({ admin, operators, query, params })) as object, 200);
  });
}

export function createAdminRouter(deps: AdminRouterDeps): OpenAPIHono<AdminEnv> {
  // Work and counts read every other area's queue and badge, so they see the finished registry.
  const registry: AdminRegistry = createAdminRegistry([
    ...deps.areas,
    deskQueueArea(),
    webhookReplayArea(),
    ...(deps.jobs === undefined ? [] : [jobsArea({ pool: deps.pool, ...deps.jobs })]),
    workArea(deps.pool, () => registry),
    countsArea(deps.pool, () => registry),
  ]);
  const app = new OpenAPIHono<AdminEnv>();

  app.use(
    `${ADMIN_BASE_PATH}/*`,
    adminGuard({
      sessions: deps.auth.auth.api,
      allowlist: deps.allowlist,
      redis: deps.redis,
      access: deps.access,
      ipHashSecret: deps.ipHashSecret,
      cli:
        deps.cliTokenSecret === undefined
          ? undefined
          : { secret: deps.cliTokenSecret, operators: deps.auth.operators },
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    }),
  );

  app.on(['GET', 'POST'], `${ADMIN_AUTH_BASE_PATH}/*`, (c) => {
    const rest = c.req.path.slice(ADMIN_AUTH_BASE_PATH.length);
    if (!AUTH_PATHS.some((pattern) => pattern.test(rest))) {
      return c.json(errorBody('NOT_FOUND', 'Not found', false), 404);
    }
    return deps.auth.handler(c.req.raw);
  });

  app.openAPIRegistry.registerPath({
    method: 'get',
    path: `${ADMIN_BASE_PATH}/me`,
    tags: ['admin'],
    summary: 'The signed-in operator, their roles and the areas they may open',
    responses: {
      200: { description: 'Operator', content: { 'application/json': { schema: adminMeSchema } } },
    },
  });
  app.get(`${ADMIN_BASE_PATH}/me`, (c) => {
    const admin = c.var.admin;
    return c.json(
      adminMeSchema.parse({
        uid: admin.uid,
        email: admin.email,
        name: admin.name,
        roles: admin.roles,
        areas: openableAdminAreas(admin.roles),
        session_expires_at: admin.sessionExpiresAt.toISOString(),
      }),
      200,
    );
  });

  app.openAPIRegistry.registerPath({
    method: 'post',
    path: `${ADMIN_BASE_PATH}/cmd/{cmd}`,
    tags: ['admin'],
    summary: 'Run one audited console command (`actor.via = admin`)',
    request: { params: z.object({ cmd: z.string() }) },
    responses: { 200: { description: 'Applied, or a replay of an applied op_id' } },
  });
  app.post(`${ADMIN_BASE_PATH}/cmd/:cmd`, async (c) => {
    const envelope: unknown = await c.req.json().catch(() => {
      throw new DomainError('VALIDATION', { reason: 'invalid_json' });
    });
    if ((envelope as { cmd?: unknown } | null)?.cmd !== c.req.param('cmd')) {
      throw new DomainError('VALIDATION', { reason: 'cmd_path_mismatch' });
    }
    const outcome = await runAdminCommand(envelope, {
      pool: deps.pool,
      registry,
      admin: c.var.admin,
      // The guard only accepts this scheme with a verified owner CLI token.
      via: c.req.header('authorization')?.startsWith('CP-Admin-CLI ') ? 'cli' : 'admin',
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    });
    if (outcome.status === 'rejected') throw new DomainError(outcome.code, outcome.detail);
    if (outcome.status === 'duplicate' && outcome.original === 'rejected') {
      throw new DomainError(outcome.code ?? 'INTERNAL', outcome.detail);
    }
    return c.json(outcomeBody(outcome), 200);
  });

  const operators: OperatorDirectory = { emails: (uids) => deps.auth.operatorEmails(uids) };
  for (const read of registry.reads()) registerRead(app, read, operators);

  app.doc31(`${ADMIN_BASE_PATH}/openapi.json`, {
    openapi: '3.1.0',
    info: { title: 'CritterPass ops console API', version: '1' },
  });

  app.notFound((c) => c.json(errorBody('NOT_FOUND', 'Not found', false), 404));
  app.onError((error, c) => {
    if (error instanceof DomainError) {
      return c.json(error.toResponseBody(), error.http as Parameters<typeof c.json>[1]);
    }
    if (error instanceof ZodError) {
      return c.json(errorBody('VALIDATION', 'Invalid request', false), 422);
    }
    deps.logger.error({ req_id: c.req.header('x-request-id'), err: error }, 'admin error');
    return c.json(errorBody('INTERNAL', 'Something went wrong', true), 500);
  });
  return app;
}

/** Mounts the console routes on the api app; the request id travels with the delegated request. */
export function mountAdminRouter(app: OpenAPIHono<AppEnv>, admin: OpenAPIHono<AdminEnv>): void {
  app.all(`${ADMIN_BASE_PATH}/*`, (c) => {
    const headers = new Headers(c.req.raw.headers);
    headers.set('x-request-id', c.var.requestId);
    return admin.fetch(new Request(c.req.raw, { headers }));
  });
}
