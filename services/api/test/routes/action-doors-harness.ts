/**
 * Real stack for the device action key suites: Testcontainers Postgres + Redis, Better Auth
 * sessions, the api app with the device command, the action-key routes, `/v1/actions` and
 * `GET /v1/notifications/{id}`, plus one test command per scope shape. Requests are signed exactly
 * the way the Swift and Kotlin signers sign them.
 */
import { createHash, createHmac } from 'node:crypto';

import { crypto as dbCrypto, runMigrations } from '@cp/db';
import { startPostgres, startRedis } from '@cp/db/testing';
import { DomainError } from '@cp/domain';
import pg from 'pg';
import { pino } from 'pino';
import { createClient, type RedisClientType } from 'redis';
import { z } from 'zod';

import { createApp } from '../../src/app';
import { createAuthModule } from '../../src/auth';
import { defineCommand } from '../../src/commands/_framework/define-command';
import { createCommandRegistry } from '../../src/commands/_framework/registry';
import { betterAuthSessionResolver } from '../../src/commands/_framework/session';
import { registerDeviceCommands } from '../../src/commands/device';
import { registerActionKeyRoutes } from '../../src/routes/action-keys';
import { registerActionsRoute } from '../../src/routes/actions';
import { registerCommandRoute } from '../../src/routes/cmd';
import { registerNotificationRoutes } from '../../src/routes/notifications';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

export interface SignedIn {
  readonly cookie: string;
  readonly uid: string;
}

export interface ActionDoorsHarness {
  readonly pool: pg.Pool;
  /** How many times each op_id's handler actually ran. */
  readonly runs: Map<string, number>;
  request(path: string, init?: RequestInit): Promise<Response>;
  signInAnonymously(): Promise<SignedIn>;
  stop(): Promise<void>;
}

/** The request signature (docs/api-contracts-async.md §5); the key is the issued secret's text. */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  ts: string,
  body: string,
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update(`${method}\n${path}\n${ts}\n${bodyHash}`)
    .digest('base64url');
}

export function signedHeaders(
  key: { key_id: string; secret: string },
  method: string,
  path: string,
  body: string,
  tsSeconds = Math.floor(Date.now() / 1000),
): Record<string, string> {
  const ts = String(tsSeconds);
  return {
    'x-cp-key-id': key.key_id,
    'x-cp-ts': ts,
    'x-cp-sig': signRequest(key.secret, method, path, ts, body),
  };
}

export async function startActionDoors(): Promise<ActionDoorsHarness> {
  const [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  await runMigrations(pool);
  const redis: RedisClientType = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  const authModule = createAuthModule({
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
  const logger = pino({ level: 'silent' });
  const app = createApp({
    service: 'api',
    version: 'test',
    commit: 'test',
    logger,
    readiness: {},
    exposeDocs: false,
    pool,
  });

  const runs = new Map<string, number>();
  const registry = createCommandRegistry();
  registerDeviceCommands(registry);
  registry.register(
    defineCommand({
      name: 'cast_test_ballot',
      v: 1,
      schema: z.object({ option_id: z.string().min(1) }),
      offline: false,
      allowAnonymous: true,
      actionScope: 'ballot',
      authorize: () => Promise.resolve(),
      handle: (_tx, payload, ctx) => {
        runs.set(ctx.opId, (runs.get(ctx.opId) ?? 0) + 1);
        if (payload.option_id === 'closed') {
          return Promise.reject(new DomainError('STATE_INVALID', { state: 'closed' }));
        }
        return Promise.resolve({ option_id: payload.option_id, via: ctx.via });
      },
    }),
  );
  const keyring = {
    activeKeyId: 'k1',
    keys: dbCrypto.parseFieldEncryptionKeys(`k1:${Buffer.alloc(32, 7).toString('base64')}`),
  };
  const sessions = betterAuthSessionResolver(authModule.auth.api);
  const deps = { pool, registry, sessions, redis, keyring };
  registerCommandRoute(app, { ...deps, logger });
  registerActionKeyRoutes(app, deps);
  registerActionsRoute(app, deps);
  registerNotificationRoutes(app, deps);
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
    runs,
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
    async stop() {
      await authModule.close();
      redis.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}
