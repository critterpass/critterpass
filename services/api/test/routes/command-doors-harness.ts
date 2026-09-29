/**
 * Real stack for the command-door suites: Testcontainers Postgres + Redis, Better Auth sessions
 * (anonymous sign-in, promoted to registered through Better Auth's own internal adapter), the api
 * app from `createApp`, and a registry holding only the commands a suite passes in.
 */
import { runMigrations } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { generateUuidV7 } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import pg from 'pg';
import { pino } from 'pino';
import { createClient, type RedisClientType } from 'redis';

import { createApp, type AppEnv } from '../../src/app';
import { createAuthModule, type AuthModule } from '../../src/auth';
import type { CommandDoorDeps } from '../../src/commands/_framework/doors';
import {
  createCommandRegistry,
  type CommandRegistry,
} from '../../src/commands/_framework/registry';
import { betterAuthSessionResolver } from '../../src/commands/_framework/session';
import { registerCmdResultsRoute } from '../../src/routes/cmd-results';
import { registerCommandRoute } from '../../src/routes/cmd';
import { registerSyncUploadRoute } from '../../src/routes/sync-upload';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

export interface SignedIn {
  readonly cookie: string;
  readonly uid: string;
}

export interface CommandDoorsHarness {
  readonly pool: pg.Pool;
  readonly redis: RedisClientType;
  /** Every line the app logged, parsed, oldest first. */
  readonly logs: readonly Record<string, unknown>[];
  request(path: string, init?: RequestInit): Promise<Response>;
  signInAnonymously(): Promise<SignedIn>;
  promoteToRegistered(uid: string): Promise<void>;
  stop(): Promise<void>;
}

/** Mounts extra routes on the same app (and deps) before Better Auth's catch-all. */
export type MountRoutes = (app: OpenAPIHono<AppEnv>, deps: CommandDoorDeps) => void;

export async function startCommandDoors(
  registerCommands: (registry: CommandRegistry) => void,
  mount?: MountRoutes,
): Promise<CommandDoorsHarness> {
  const [postgres, redisContainer]: [StartedPostgreSqlContainer, StartedRedisContainer] =
    await Promise.all([startPostgres(), startRedis()]);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  await runMigrations(pool);
  const redis: RedisClientType = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  const authModule: AuthModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: disabledAttestationConfig(),
  });

  const logs: Record<string, unknown>[] = [];
  const logger = pino(
    { level: 'info' },
    { write: (line: string) => logs.push(JSON.parse(line) as Record<string, unknown>) },
  );
  const app = createApp({
    service: 'api',
    version: 'test',
    commit: 'test',
    logger,
    readiness: {},
    exposeDocs: false,
    pool,
  });
  const registry = createCommandRegistry();
  registerCommands(registry);
  const deps: CommandDoorDeps = {
    pool,
    registry,
    sessions: betterAuthSessionResolver(authModule.auth.api),
    redis,
    logger,
  };
  registerCommandRoute(app, deps);
  registerSyncUploadRoute(app, deps);
  registerCmdResultsRoute(app, deps);
  mount?.(app, deps);
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));

  const request = (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return Promise.resolve(app.request(`http://localhost:8787${path}`, { ...init, headers }));
  };

  return {
    pool,
    redis,
    logs,
    request,
    async signInAnonymously() {
      const response = await request('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
      const cookie = /better-auth\.session_token=[^;]+/.exec(
        response.headers.get('set-cookie') ?? '',
      )?.[0];
      const body = (await response.json()) as { user: { id: string } };
      if (!cookie) throw new Error(`sign-in/anonymous set no cookie: ${JSON.stringify(body)}`);
      return { cookie, uid: body.user.id };
    },
    async promoteToRegistered(uid) {
      // Through Better Auth's internal adapter, not raw SQL: its Redis session mirror would
      // otherwise keep serving the stale anonymous flag.
      const context = (await authModule.auth.$context) as unknown as {
        internalAdapter: {
          updateUser(id: string, data: Record<string, unknown>): Promise<unknown>;
        };
      };
      await context.internalAdapter.updateUser(uid, { isAnonymous: false });
    },
    async stop() {
      await authModule.close();
      redis.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}

export function envelope(cmd: string, payload: unknown, overrides: Record<string, unknown> = {}) {
  return {
    op_id: generateUuidV7(),
    cmd,
    v: 1,
    actor: { uid: generateUuidV7(), via: 'offline' },
    device: { id: 'device-1', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
    client_ts: new Date().toISOString(),
    payload,
    ...overrides,
  };
}
