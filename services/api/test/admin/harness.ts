/**
 * A real api app with the console routes mounted over Testcontainers Postgres + Redis, the console's
 * own Better Auth instance (dev sign-in enabled), and helpers to seed operators and send commands.
 */
import { startPostgres, startRedis } from '@cp/db/testing';
import { runMigrations } from '@cp/db';
import { ADMIN_CONSOLE_DEVICE, generateUuidV7, type AdminRole } from '@cp/domain';
import pg from 'pg';
import { pino } from 'pino';
import { createClient, type RedisClientType } from 'redis';

import { createApp } from '../../src/app';
import type { AccessVerifier } from '../../src/admin/access';
import { parseAdminAllowlist } from '../../src/admin/allowlist';
import { createAdminAuth, type AdminAuth } from '../../src/admin/auth';
import { createAdminRouter, mountAdminRouter } from '../../src/admin/router';
import type { AdminAreaDefinition } from '../../src/admin/registry';

export const ADMIN_ORIGIN = 'http://localhost:5173';
const SECRET = 'test-secret-at-least-32-characters-long';

export interface AdminHarness {
  readonly pool: pg.Pool;
  readonly redis: RedisClientType;
  /** Builds an app; `allowlist` defaults to every seeded operator. */
  app(options?: AppOptions): TestApp;
  seedOperator(email: string, roles: readonly AdminRole[]): Promise<string>;
  stop(): Promise<void>;
}

export interface AppOptions {
  readonly areas?: readonly AdminAreaDefinition[];
  readonly allowlist?: string;
  readonly access?: AccessVerifier;
  readonly now?: () => Date;
}

export interface TestApp {
  request(path: string, init?: RequestInit): Promise<Response>;
  signIn(email: string): Promise<string>;
  command(cookie: string, cmd: string, payload: unknown, opId?: string): Promise<Response>;
  close(): Promise<void>;
}

export async function startAdminHarness(): Promise<AdminHarness> {
  const [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  pool.on('error', () => undefined);
  await runMigrations(pool);
  const redis: RedisClientType = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  const seeded: string[] = [];
  const opened: AdminAuth[] = [];

  function buildAuth(allowlist: string): AdminAuth {
    const auth = createAdminAuth({
      authDatabaseUrl: postgres.getConnectionUri(),
      secret: SECRET,
      publicOrigin: ADMIN_ORIGIN,
      allowlist: parseAdminAllowlist(allowlist),
      devSignIn: true,
    });
    opened.push(auth);
    return auth;
  }

  return {
    pool,
    redis,
    async seedOperator(email, roles) {
      const auth = buildAuth(`${email}:${roles.join('+')}`);
      const context = (await auth.auth.$context) as unknown as {
        internalAdapter: {
          createUser(user: Record<string, unknown>): Promise<{ id: string }>;
        };
      };
      const user = await context.internalAdapter.createUser({
        email,
        name: email.split('@')[0],
        emailVerified: true,
      });
      seeded.push(email);
      return user.id;
    },
    app(options = {}) {
      const allowlist = options.allowlist ?? seeded.join(',');
      const auth = buildAuth(allowlist);
      const app = createApp({
        service: 'api',
        version: 'test',
        commit: 'test',
        logger: pino({ level: 'silent' }),
        readiness: {},
        exposeDocs: false,
        pool,
      });
      mountAdminRouter(
        app,
        createAdminRouter({
          pool,
          redis,
          logger: pino({ level: 'silent' }),
          auth,
          allowlist: parseAdminAllowlist(allowlist),
          access: options.access,
          ipHashSecret: SECRET,
          areas: options.areas ?? [],
          ...(options.now !== undefined ? { now: options.now } : {}),
        }),
      );
      const request = (path: string, init: RequestInit = {}) => {
        const headers = new Headers(init.headers);
        headers.set('origin', ADMIN_ORIGIN);
        if (init.body !== undefined) headers.set('content-type', 'application/json');
        return Promise.resolve(app.request(path, { ...init, headers }));
      };
      return {
        request,
        async signIn(email) {
          const response = await request('/v1/admin/auth/dev/sign-in', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
          const cookie = /cp_admin\.session_token=[^;]+/.exec(
            response.headers.get('set-cookie') ?? '',
          )?.[0];
          if (cookie === undefined) throw new Error(`sign-in failed: ${response.status}`);
          return cookie;
        },
        command(cookie, cmd, payload, opId = generateUuidV7()) {
          return request(`/v1/admin/cmd/${cmd}`, {
            method: 'POST',
            headers: { cookie, 'x-real-ip': '203.0.113.7' },
            body: JSON.stringify({
              op_id: opId,
              cmd,
              v: 1,
              actor: { uid: generateUuidV7(), via: 'admin' },
              device: ADMIN_CONSOLE_DEVICE,
              client_ts: new Date().toISOString(),
              payload,
            }),
          });
        },
        close: () => auth.close(),
      };
    },
    async stop() {
      await Promise.all(opened.map((auth) => auth.close().catch(() => undefined)));
      redis.destroy();
      await pool.end();
      await Promise.all([postgres.stop(), redisContainer.stop()]);
    },
  };
}
