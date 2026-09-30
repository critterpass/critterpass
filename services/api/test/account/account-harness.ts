/**
 * Real stack for the profile and account suites: Testcontainers Postgres + Redis, the api app, a
 * real Better Auth instance (anonymous sign-in, phone verification and returning phone sign-in over
 * a capturing WhatsApp adapter, the provider boundary), the registry wrapped by the closed-account
 * guard exactly as `registerFeatureRoutes` wraps it, the `/v1/me/*` reads, and a started job
 * producer so commands can enqueue.
 */
import { runMigrations, withSystem } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { generateUuidV7 } from '@cp/domain';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { pino } from 'pino';
import { createClient, type RedisClientType } from 'redis';

import { createAccountAuthControl } from '../../src/account/auth-control';
import { guardClosedAccounts } from '../../src/account/closed-guard';
import { createApp } from '../../src/app';
import { createAuthModule, type AuthModule } from '../../src/auth';
import type { CommandDoorDeps } from '../../src/commands/_framework/doors';
import { createCommandRegistry } from '../../src/commands/_framework/registry';
import { betterAuthSessionResolver } from '../../src/commands/_framework/session';
import {
  createRequestAccountDeletionCommand,
  registerAccountCommands,
} from '../../src/commands/account';
import { registerYouCommands } from '../../src/commands/you';
import { startJobProducer } from '../../src/jobs/producer';
import { registerReturningPhoneSignInRoute } from '../../src/routes/auth-extra';
import { registerCmdResultsRoute } from '../../src/routes/cmd-results';
import { registerCommandRoute } from '../../src/routes/cmd';
import { registerMeAccountRoutes } from '../../src/routes/me-account';
import { registerSyncUploadRoute } from '../../src/routes/sync-upload';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

const SECRET = 'test-secret-at-least-32-characters-long';

export interface Session {
  readonly cookie: string;
  readonly uid: string;
}

export type Body = Record<string, unknown> & {
  result?: Record<string, unknown>;
  error?: { code: string; detail?: Record<string, unknown> };
};

export interface AccountHarness {
  readonly pool: pg.Pool;
  anonymous(): Promise<Session>;
  /** Anonymous sign-in, then a verified phone on the same uid: an account with an identity. */
  registered(phone: string): Promise<Session>;
  /** A fresh sign-in to an existing phone account (a second device, or after sign-out). */
  signInAgain(phone: string): Promise<Session>;
  cmd(session: Session, name: string, payload: unknown, opId?: string): Promise<[number, Body]>;
  get(session: Session, path: string): Promise<[number, Body]>;
  upload(session: Session, ops: unknown[]): Promise<{ status: string; code?: string }[]>;
  rows<T>(sql: string, params?: unknown[]): Promise<T[]>;
  events(type: string): Promise<Record<string, unknown>[]>;
  stop(): Promise<void>;
}

export function envelope(uid: string, cmd: string, payload: unknown, opId = generateUuidV7()) {
  return {
    op_id: opId,
    cmd,
    v: 1,
    actor: { uid, via: 'app' },
    device: { id: 'device-1', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
    client_ts: new Date().toISOString(),
    payload,
  };
}

export async function startAccountHarness(): Promise<AccountHarness> {
  const [postgres, redisContainer]: [StartedPostgreSqlContainer, StartedRedisContainer] =
    await Promise.all([startPostgres(), startRedis()]);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  await runMigrations(pool);
  const redis: RedisClientType = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  const codes = new Map<string, string>();
  const authModule: AuthModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: SECRET,
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {
      whatsapp: {
        send: ({ phoneE164, code }) => {
          codes.set(phoneE164, code);
          return Promise.resolve({});
        },
      },
    },
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
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
  const base = createCommandRegistry();
  registerYouCommands(base);
  registerAccountCommands(base);
  base.register(
    createRequestAccountDeletionCommand(createAccountAuthControl(authModule.auth, {}, undefined)),
  );
  const deps: CommandDoorDeps = {
    pool,
    registry: guardClosedAccounts(base),
    sessions: betterAuthSessionResolver(authModule.auth.api),
    redis,
    logger,
  };
  registerCommandRoute(app, deps);
  registerSyncUploadRoute(app, deps);
  registerCmdResultsRoute(app, deps);
  registerMeAccountRoutes(app, {
    ...deps,
    signing: { baseUrl: 'https://media.example.test', keyId: 'k1', secret: 'x'.repeat(40) },
  });
  registerReturningPhoneSignInRoute(app, { auth: authModule.auth, redis, secret: SECRET });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));

  const { connectionString } = (pool as unknown as { options: { connectionString: string } })
    .options;
  const producer: PgBoss = await startJobProducer({
    connectionString,
    logger: { error: () => undefined },
  });

  const request = (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return Promise.resolve(app.request(`http://localhost:8787${path}`, { ...init, headers }));
  };
  const cookieOf = (response: Response): string => {
    const cookie = /better-auth\.session_token=[^;]+/.exec(
      response.headers.get('set-cookie') ?? '',
    )?.[0];
    if (cookie === undefined) throw new Error(`no session cookie (status ${response.status})`);
    return cookie;
  };
  const post = (path: string, body: unknown, cookie?: string) =>
    request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      ...(cookie === undefined ? {} : { headers: { cookie } }),
    });

  const anonymous = async (): Promise<Session> => {
    const response = await post('/api/auth/sign-in/anonymous', {});
    const cookie = cookieOf(response);
    const { user } = (await response.json()) as { user: { id: string } };
    return { cookie, uid: user.id };
  };

  return {
    pool,
    anonymous,
    async registered(phone) {
      const session = await anonymous();
      await post('/api/auth/phone-number/send-otp', { phoneNumber: phone }, session.cookie);
      const verify = await post(
        '/api/auth/phone-number/verify',
        { phoneNumber: phone, code: codes.get(phone), updatePhoneNumber: true },
        session.cookie,
      );
      if (verify.status !== 200) throw new Error(`verify failed: ${await verify.text()}`);
      return session;
    },
    async signInAgain(phone) {
      await post('/api/auth/phone-number/send-otp', { phoneNumber: phone });
      const response = await post('/api/auth/sign-in/phone-number', {
        phoneNumber: phone,
        code: codes.get(phone),
      });
      if (response.status !== 200) throw new Error(`sign-in failed: ${await response.text()}`);
      const { user } = (await response.json()) as { user: { id: string } };
      return { cookie: cookieOf(response), uid: user.id };
    },
    async cmd(session, name, payload, opId) {
      const response = await post(
        `/v1/cmd/${name}`,
        envelope(session.uid, name, payload, opId),
        session.cookie,
      );
      return [response.status, (await response.json()) as Body];
    },
    async get(session, path) {
      const response = await request(path, { headers: { cookie: session.cookie } });
      return [response.status, (await response.json()) as Body];
    },
    async upload(session, ops) {
      const response = await post('/sync/upload', { ops }, session.cookie);
      return ((await response.json()) as { results: { status: string; code?: string }[] }).results;
    },
    rows: <T>(sql: string, params: unknown[] = []) =>
      withSystem(pool, async (tx) => (await tx.query(sql, params)).rows as T[]),
    async events(type) {
      const result = await pool.query<{ payload: Record<string, unknown> }>(
        'SELECT payload FROM domain_events WHERE type = $1 ORDER BY occurred_at',
        [type],
      );
      return result.rows.map((row) => row.payload);
    },
    async stop() {
      await producer.stop({ graceful: false });
      await authModule.close();
      redis.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}
