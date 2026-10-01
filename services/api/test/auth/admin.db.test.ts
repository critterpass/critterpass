/**
 * Admin roles and audit (docs/product-decisions.md; this phase's Requirements: "Better Auth admin
 * plugin roles admin, support, content; impersonation disabled in prod; every admin action →
 * ops.admin_audit"). Drives a real Better Auth instance the same way link-social.db.test.ts does.
 */
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';

import { disabledAttestationConfig } from './test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
const SECRET = 'test-secret-at-least-32-characters-long';

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
}, 180_000);

afterEach(async () => {
  await authModule?.close();
});

afterAll(async () => {
  redis?.destroy();
  await pool?.end();
  await Promise.all([postgres?.stop(), redisContainer?.stop()]);
});

function buildModule(isProduction: boolean): AuthModule {
  return createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: SECRET,
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    rateLimit: { customRules: { '/sign-in/*': { window: 1, max: 1000 } } },
    attestation: disabledAttestationConfig(),
    isProduction,
  });
}

async function authRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return authModule.handler(
    new Request(`http://localhost:8787/api/auth${path}`, { ...init, headers }),
  );
}

interface SignedIn {
  readonly cookie: string;
  readonly uid: string;
}

async function signInAnonymously(): Promise<SignedIn> {
  const response = await authRequest('/sign-in/anonymous', { method: 'POST', body: '{}' });
  const setCookie = response.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  const body = (await response.json()) as { user: { id: string } };
  if (!cookie) throw new Error(`sign-in/anonymous did not set a cookie: ${JSON.stringify(body)}`);
  return { cookie, uid: body.user.id };
}

interface InternalAdapterUserUpdater {
  updateUser(userId: string, data: Record<string, unknown>): Promise<unknown>;
}

/**
 * No admin-provisioning route exists in this phase, so tests stand in a role the same way Better
 * Auth's own `/admin/set-role` endpoint would: through `internalAdapter.updateUser`. A raw
 * `UPDATE auth.user` bypasses this and leaves the Redis `secondaryStorage` mirror
 * (services/api/src/auth/index.ts's `secondaryStorage`) holding the pre-update role — `findSession`
 * (better-auth's internal-adapter) reads that mirror first and only falls back to Postgres when no
 * entry exists, so a direct SQL write is silently invisible to every subsequent request.
 */
async function bootstrapRole(uid: string, role: string): Promise<void> {
  const context = (await authModule.auth.$context) as unknown as {
    internalAdapter: InternalAdapterUserUpdater;
  };
  await context.internalAdapter.updateUser(uid, { role });
}

describe('admin roles and audit', () => {
  it('lets an admin ban a user and writes one ops.admin_audit row', async () => {
    authModule = buildModule(false);
    const admin = await signInAnonymously();
    const target = await signInAnonymously();
    await bootstrapRole(admin.uid, 'admin');

    const response = await authRequest('/admin/ban-user', {
      method: 'POST',
      headers: { cookie: admin.cookie },
      body: JSON.stringify({ userId: target.uid, banReason: 'spam' }),
    });
    expect(response.status).toBe(200);

    const { rows } = await pool.query<{
      admin_id: string;
      action: string;
      target_id: string;
      reason: string | null;
    }>('SELECT admin_id, action, target_id, reason FROM ops.admin_audit WHERE admin_id = $1', [
      admin.uid,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      admin_id: admin.uid,
      action: '/admin/ban-user',
      target_id: target.uid,
      reason: 'spam',
    });
  });

  it('denies a content-role user the ban permission', async () => {
    authModule = buildModule(false);
    const content = await signInAnonymously();
    const target = await signInAnonymously();
    await bootstrapRole(content.uid, 'content');

    const response = await authRequest('/admin/ban-user', {
      method: 'POST',
      headers: { cookie: content.cookie },
      body: JSON.stringify({ userId: target.uid, banReason: 'spam' }),
    });
    expect(response.status).toBe(403);
  });

  it('lets a support-role user ban but not create a user', async () => {
    authModule = buildModule(false);
    const support = await signInAnonymously();
    const target = await signInAnonymously();
    await bootstrapRole(support.uid, 'support');

    const banResponse = await authRequest('/admin/ban-user', {
      method: 'POST',
      headers: { cookie: support.cookie },
      body: JSON.stringify({ userId: target.uid, banReason: 'spam' }),
    });
    expect(banResponse.status).toBe(200);

    const createResponse = await authRequest('/admin/create-user', {
      method: 'POST',
      headers: { cookie: support.cookie },
      body: JSON.stringify({ email: 'new@example.com', password: 'password123', name: 'New User' }),
    });
    expect(createResponse.status).toBe(403);
  });

  it('denies impersonation in production', async () => {
    authModule = buildModule(true);
    const admin = await signInAnonymously();
    const target = await signInAnonymously();
    await bootstrapRole(admin.uid, 'admin');

    const response = await authRequest('/admin/impersonate-user', {
      method: 'POST',
      headers: { cookie: admin.cookie },
      body: JSON.stringify({ userId: target.uid }),
    });
    expect(response.status).toBe(403);
  });

  it('allows impersonation outside production', async () => {
    authModule = buildModule(false);
    const admin = await signInAnonymously();
    const target = await signInAnonymously();
    await bootstrapRole(admin.uid, 'admin');

    const response = await authRequest('/admin/impersonate-user', {
      method: 'POST',
      headers: { cookie: admin.cookie },
      body: JSON.stringify({ userId: target.uid }),
    });
    expect(response.status).toBe(200);
  });
});
