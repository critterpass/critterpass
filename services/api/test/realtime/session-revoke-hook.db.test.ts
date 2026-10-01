/**
 * An admin ending another user's sessions through the real Better Auth admin plugin queues one
 * realtime `disconnect` for that user; a refused call queues nothing.
 */
import { runMigrations, withSystem } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { userChannel } from '@cp/domain';
import { Hono } from 'hono';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import { sessionRevokeRealtimeMiddleware } from '../../src/realtime/session-revoke-hook';
import { disabledAttestationConfig } from '../auth/test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let app: Hono;
const loggedErrors: unknown[] = [];

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: disabledAttestationConfig(),
    isProduction: false,
  });
  app = new Hono();
  app.use(
    '/api/auth/admin/*',
    sessionRevokeRealtimeMiddleware({ pool, logger: { error: (d) => loggedErrors.push(d) } }),
  );
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));
}, 180_000);

afterAll(async () => {
  await authModule?.close();
  redis?.destroy();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

async function signInAnonymously(): Promise<{ cookie: string; uid: string }> {
  const response = await app.request('/api/auth/sign-in/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const cookie = /better-auth\.session_token=[^;]+/.exec(
    response.headers.get('set-cookie') ?? '',
  )?.[0];
  const body = (await response.json()) as { user: { id: string } };
  if (!cookie) throw new Error('sign-in/anonymous did not set a cookie');
  return { cookie, uid: body.user.id };
}

async function makeAdmin(uid: string): Promise<void> {
  const context = (await authModule.auth.$context) as unknown as {
    internalAdapter: { updateUser(id: string, data: Record<string, unknown>): Promise<unknown> };
  };
  await context.internalAdapter.updateUser(uid, { role: 'admin' });
}

async function disconnectRows(uid: string) {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<{ kind: string; payload: unknown }>(
      'SELECT kind, payload FROM rt_outbox WHERE channel = $1 AND kind = $2',
      [userChannel(uid), 'disconnect'],
    ),
  );
  return rows;
}

describe('admin session revocation → realtime disconnect', () => {
  it('queues a disconnect for the banned user after a successful ban', async () => {
    const admin = await signInAnonymously();
    const target = await signInAnonymously();
    await makeAdmin(admin.uid);

    const response = await app.request('/api/auth/admin/ban-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ userId: target.uid, banReason: 'spam' }),
    });
    expect(response.status).toBe(200);
    expect(await disconnectRows(target.uid)).toEqual([
      { kind: 'disconnect', payload: { type: 'session.revoked', user_id: target.uid } },
    ]);
    expect(loggedErrors).toEqual([]);
  });

  it('queues a disconnect after revoke-user-sessions', async () => {
    const admin = await signInAnonymously();
    const target = await signInAnonymously();
    await makeAdmin(admin.uid);

    const response = await app.request('/api/auth/admin/revoke-user-sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: admin.cookie },
      body: JSON.stringify({ userId: target.uid }),
    });
    expect(response.status).toBe(200);
    expect(await disconnectRows(target.uid)).toHaveLength(1);
  });

  it('queues nothing when the caller is not an admin', async () => {
    const caller = await signInAnonymously();
    const target = await signInAnonymously();

    const response = await app.request('/api/auth/admin/ban-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: caller.cookie },
      body: JSON.stringify({ userId: target.uid }),
    });
    expect(response.status).not.toBe(200);
    expect(await disconnectRows(target.uid)).toEqual([]);
  });
});
