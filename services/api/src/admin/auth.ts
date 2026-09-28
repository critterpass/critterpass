/**
 * The ops console's own Better Auth instance: basePath `/v1/admin/auth`, cookie prefix `cp_admin`,
 * a 12 h session that never slides, Google sign-in plus the `admin` plugin only, and no
 * impersonation. It shares `auth.user`/`auth.session` with the app's instance but signs cookies with
 * its own derived secret, so an app session token can never be replayed as a console cookie.
 *
 * Only e-mails on `ADMIN_ALLOWLIST` may create an account here; the allow-list entry's role (if any)
 * is the account's first role, after which roles change only through `set_admin_role`.
 */
import { createHmac } from 'node:crypto';

import { schema } from '@cp/db';
import { generateUuidV7, serializeAdminRoles } from '@cp/domain';
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { z } from 'zod';

import type { AdminAllowlist } from './allowlist';
import { createOperatorStore, type OperatorStore } from './operators';

export const ADMIN_AUTH_BASE_PATH = '/v1/admin/auth';
export const ADMIN_COOKIE_PREFIX = 'cp_admin';
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

const ac = createAccessControl(defaultStatements);

/** Better Auth's own admin endpoints stay closed: every console write is an audited command. */
function adminPluginRoles() {
  return {
    owner: ac.newRole({ user: [], session: [] }),
    ops: ac.newRole({ user: [], session: [] }),
    content: ac.newRole({ user: [], session: [] }),
    support: ac.newRole({ user: [], session: [] }),
  };
}

export interface AdminGoogleConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface AdminAuthDeps {
  readonly authDatabaseUrl: string;
  /** The console's Better Auth pool size (default 2). */
  readonly poolMax?: number;
  /** The api's Better Auth secret; the console derives its own signing secret from it. */
  readonly secret: string;
  /** Public origin the console is served from, e.g. `https://admin.critterpass.app`. */
  readonly publicOrigin: string;
  readonly allowlist: AdminAllowlist;
  readonly google?: AdminGoogleConfig | undefined;
  /** Local development only: `POST /v1/admin/auth/dev/sign-in {email}` for an allow-listed user. */
  readonly devSignIn?: boolean | undefined;
  readonly onPoolError?: ((error: Error) => void) | undefined;
}

export interface AdminAuth {
  readonly auth: ReturnType<typeof betterAuth>;
  handler(request: Request): Promise<Response>;
  /** Console operators' e-mails by uid, for "changed by" columns. */
  operatorEmails(uids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Console accounts and their roles (CLI owner lookup, `set_admin_role`). */
  readonly operators: OperatorStore;
  close(): Promise<void>;
}

function deriveSecret(secret: string): string {
  return createHmac('sha256', secret).update('cp-admin-console').digest('base64url');
}

/** Signs in an existing allow-listed user without Google; never mounted outside local development. */
function devSignInPlugin(allowlist: AdminAllowlist): BetterAuthPlugin {
  return {
    id: 'cp-admin-dev-sign-in',
    endpoints: {
      adminDevSignIn: createAuthEndpoint(
        '/dev/sign-in',
        { method: 'POST', body: z.object({ email: z.email() }) },
        async (ctx) => {
          const email = ctx.body.email.toLowerCase();
          if (!allowlist.allows(email)) throw new APIError('FORBIDDEN');
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (found === null) throw new APIError('NOT_FOUND');
          const session = await ctx.context.internalAdapter.createSession(found.user.id);
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ uid: found.user.id });
        },
      ),
    },
  };
}

export function buildAdminAuthOptions(
  deps: AdminAuthDeps,
  db: Parameters<typeof drizzleAdapter>[0],
): BetterAuthOptions {
  const allowlist = deps.allowlist;
  return {
    appName: 'CritterPass Ops',
    baseURL: `${deps.publicOrigin}${ADMIN_AUTH_BASE_PATH}`,
    basePath: ADMIN_AUTH_BASE_PATH,
    secret: deriveSecret(deps.secret),
    trustedOrigins: [deps.publicOrigin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schemaName: 'auth',
      usePlural: false,
      transaction: true,
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    advanced: {
      database: { generateId: () => generateUuidV7() },
      ipAddress: { ipAddressHeaders: ['x-real-ip'], ipv6Subnet: 64 },
      cookiePrefix: ADMIN_COOKIE_PREFIX,
      // Host-only cookies (no Domain); the session cookie is Strict so no other site can ride it.
      // The OAuth state cookie stays Lax: Google's redirect back is a cross-site navigation.
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true, path: '/' },
      cookies: { session_token: { attributes: { sameSite: 'strict' } } },
    },
    session: {
      expiresIn: ADMIN_SESSION_SECONDS,
      disableSessionRefresh: true,
      storeSessionInDatabase: true,
      cookieCache: { enabled: false },
      // Marks console sessions, so operator views and role changes never touch app sessions.
      additionalFields: { console: { type: 'boolean', defaultValue: true, input: false } },
    },
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    rateLimit: { enabled: true, storage: 'memory', window: 60, max: 30 },
    databaseHooks: {
      user: {
        create: {
          before: (user) => {
            const email = user.email.toLowerCase();
            if (!allowlist.allows(email)) {
              return Promise.reject(
                new APIError('FORBIDDEN', { message: 'Not on the allow-list' }),
              );
            }
            const role = serializeAdminRoles(allowlist.initialRoles(email));
            return Promise.resolve({ data: { ...user, email, role } });
          },
        },
      },
    },
    socialProviders: deps.google
      ? {
          google: {
            clientId: deps.google.clientId,
            clientSecret: deps.google.clientSecret,
            prompt: 'select_account',
          },
        }
      : {},
    plugins: [
      admin({
        ac,
        roles: adminPluginRoles(),
        adminRoles: ['owner'],
      }),
      ...(deps.devSignIn ? [devSignInPlugin(allowlist)] : []),
    ],
  };
}

export function createAdminAuth(deps: AdminAuthDeps): AdminAuth {
  const pool = new pg.Pool({ connectionString: deps.authDatabaseUrl, max: deps.poolMax ?? 2 });
  pool.on(
    'error',
    deps.onPoolError ??
      ((error) => process.emitWarning(`idle admin auth database client error: ${error.message}`)),
  );
  const auth = betterAuth(buildAdminAuthOptions(deps, drizzle(pool)));
  return {
    auth,
    operators: createOperatorStore(pool),
    handler: (request) => auth.handler(request),
    async operatorEmails(uids) {
      if (uids.length === 0) return new Map();
      const { rows } = await pool.query<{ id: string; email: string }>(
        'SELECT id, email FROM auth."user" WHERE id = ANY($1::uuid[]) AND role IS NOT NULL',
        [uids],
      );
      return new Map(rows.map((row) => [row.id, row.email]));
    },
    close: () => pool.end(),
  };
}
