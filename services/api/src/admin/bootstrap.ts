/**
 * Builds the ops console from the api environment. Returns `undefined` (routes unmounted) until
 * `ADMIN_PUBLIC_ORIGIN` and `ADMIN_ALLOWLIST` are set; refuses to start a production console without
 * Cloudflare Access, and a dev sign-in anywhere but local development.
 */
import type pg from 'pg';
import type { Logger } from 'pino';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import type { ApiEnv } from '../env';
import { READ_URL_TTL_SECONDS, mediaSigningConfigFromEnv, mintReadUrl } from '../media/sign';
import { createAccessVerifier } from './access';
import { createAccountControl, type AppAuthHandle } from './accounts';
import { parseAdminAllowlist } from './allowlist';
import { adminAreas } from './areas';
import { createAdminAuth } from './auth';
import type { MediaUrlSigner } from './moderation-intake';
import { createAdminRouter, type AdminRouterDeps } from './router';

export interface AdminConsole {
  readonly router: ReturnType<typeof createAdminRouter>;
  close(): Promise<void>;
}

export interface AdminConsoleDeps {
  readonly pool: pg.Pool;
  readonly redis: RateLimitRedisClient;
  readonly logger: Pick<Logger, 'error' | 'warn'>;
  /** The app's own Better Auth instance: account actions must go through its session store. */
  readonly appAuth: AppAuthHandle;
  /** The jobs panel's pg-boss producer and worker heartbeat reader. */
  readonly jobs?: AdminRouterDeps['jobs'];
}

/** Signed media Worker URLs for moderation previews, when media signing is configured. */
function mediaSigner(env: ApiEnv): MediaUrlSigner {
  if (!env.MEDIA_PUBLIC_BASE_URL || !env.MEDIA_HMAC_KEYS || !env.MEDIA_HMAC_ACTIVE_KID) {
    return () => Promise.resolve(null);
  }
  const config = mediaSigningConfigFromEnv({
    baseUrl: env.MEDIA_PUBLIC_BASE_URL,
    keysJson: env.MEDIA_HMAC_KEYS,
    activeKeyId: env.MEDIA_HMAC_ACTIVE_KID,
  });
  return (objectKey) =>
    mintReadUrl(config, objectKey, Math.floor(Date.now() / 1000) + READ_URL_TTL_SECONDS);
}

export function buildAdminConsole(env: ApiEnv, deps: AdminConsoleDeps): AdminConsole | undefined {
  if (env.ADMIN_PUBLIC_ORIGIN === undefined || env.ADMIN_ALLOWLIST === undefined) return undefined;
  const access =
    env.CF_ACCESS_TEAM_DOMAIN !== undefined && env.CF_ACCESS_AUD !== undefined
      ? createAccessVerifier({ teamDomain: env.CF_ACCESS_TEAM_DOMAIN, audience: env.CF_ACCESS_AUD })
      : undefined;
  if (access === undefined && env.APP_ENV === 'production') {
    throw new Error('The ops console needs CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD in production');
  }
  if (access === undefined) {
    deps.logger.warn('Ops console runs without Cloudflare Access: CF_ACCESS_* is unset');
  }
  if (env.ADMIN_DEV_SIGN_IN && env.APP_ENV !== 'local') {
    throw new Error('ADMIN_DEV_SIGN_IN is only allowed with APP_ENV=local');
  }
  const allowlist = parseAdminAllowlist(env.ADMIN_ALLOWLIST);
  const auth = createAdminAuth({
    authDatabaseUrl: env.AUTH_DATABASE_URL,
    poolMax: env.ADMIN_AUTH_POOL_MAX,
    secret: env.BETTER_AUTH_SECRET,
    publicOrigin: env.ADMIN_PUBLIC_ORIGIN.replace(/\/$/, ''),
    allowlist,
    google:
      env.ADMIN_GOOGLE_CLIENT_ID !== undefined && env.ADMIN_GOOGLE_CLIENT_SECRET !== undefined
        ? { clientId: env.ADMIN_GOOGLE_CLIENT_ID, clientSecret: env.ADMIN_GOOGLE_CLIENT_SECRET }
        : undefined,
    devSignIn: env.ADMIN_DEV_SIGN_IN,
    onPoolError: (error) => deps.logger.error({ err: error }, 'idle admin auth client error'),
  });
  const router = createAdminRouter({
    pool: deps.pool,
    redis: deps.redis,
    logger: deps.logger,
    auth,
    allowlist,
    access,
    ipHashSecret: env.BETTER_AUTH_SECRET,
    cliTokenSecret: env.BETTER_AUTH_SECRET,
    jobs: deps.jobs,
    areas: adminAreas({
      pool: deps.pool,
      accounts: createAccountControl(deps.appAuth, deps.pool),
      media: mediaSigner(env),
      operators: auth.operators,
      allowlist,
    }),
  });
  return { router, close: () => auth.close() };
}
