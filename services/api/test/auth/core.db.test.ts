/**
 * T1 done-when (phase-9): anonymous sign-in creates `auth.user` + `public.users` with identical
 * uuidv7; `app_user` cannot SELECT `auth.*`. Drives a real Better Auth instance over HTTP
 * (`authModule.handler`) against Testcontainers Postgres + Redis, the same way a real client would.
 */
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations, withUser } from '@cp/db';
import { isUuidV7 } from '@cp/domain';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  authModule = createAuthModule({
    appPool: pool,
    // app_owner already inherits the `auth` role locally/in tests (bootstrap migration); a real
    // dedicated `auth`-role connection is a staging/production credential, not something this
    // Testcontainers database provisions a password for.
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    // This suite is not exercising rate limiting (that is abuse/rate-limits.db.test.ts): Better
    // Auth's own hard-coded default for /sign-in* (3 per 10 s) would otherwise fail repeated
    // sign-ins across this file's tests.
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
  });
}, 180_000);

afterAll(async () => {
  await authModule.close();
  redis.destroy();
  await pool.end();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

function authRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return authModule.handler(
    new Request(`http://localhost:8787/api/auth${path}`, { ...init, headers }),
  );
}

describe('anonymous sign-in', () => {
  it('creates auth.user and public.users with the identical uuidv7', async () => {
    const response = await authRequest('/sign-in/anonymous', { method: 'POST', body: '{}' });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { id: string; isAnonymous: boolean } };
    expect(isUuidV7(body.user.id)).toBe(true);
    expect(body.user.isAnonymous).toBe(true);

    const authRow = await pool.query<{ id: string; is_anonymous: boolean }>(
      'SELECT id, is_anonymous FROM auth."user" WHERE id = $1',
      [body.user.id],
    );
    expect(authRow.rows).toHaveLength(1);
    expect(authRow.rows[0]?.is_anonymous).toBe(true);

    const publicRow = await pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM users WHERE id = $1',
      [body.user.id],
    );
    expect(publicRow.rows).toHaveLength(1);
    expect(publicRow.rows[0]?.status).toBe('anonymous');

    const settingsRow = await pool.query('SELECT 1 FROM user_settings WHERE user_id = $1', [
      body.user.id,
    ]);
    expect(settingsRow.rowCount).toBe(1);
  });

  it('lets the new anonymous user read their own public.users row as app_user', async () => {
    const response = await authRequest('/sign-in/anonymous', { method: 'POST', body: '{}' });
    const body = (await response.json()) as { user: { id: string } };

    const rows = await withUser(pool, body.user.id, 'test-device', (tx) =>
      tx.query('SELECT status FROM users WHERE id = $1', [body.user.id]),
    );
    expect(rows.rows).toEqual([{ status: 'anonymous' }]);
  });
});

describe('auth schema isolation', () => {
  it('denies app_user any access to auth.user, even by id', async () => {
    const response = await authRequest('/sign-in/anonymous', { method: 'POST', body: '{}' });
    const body = (await response.json()) as { user: { id: string } };

    await expect(
      withUser(pool, body.user.id, 'test-device', (tx) =>
        tx.query('SELECT 1 FROM auth."user" WHERE id = $1', [body.user.id]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
