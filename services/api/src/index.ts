import { serve } from '@hono/node-server';
import { subscribe } from 'node:diagnostics_channel';

import packageJson from '../package.json' with { type: 'json' };

import { createApp } from './app';
import { loadApiEnv } from './env';
import { createAuthModule } from './auth';
import { mountAuthHandler } from './auth/mount';
import {
  buildAppleSiwaConfigFromEnv,
  buildAppleSocialConfigFromEnv,
  buildAttestationConfigFromEnv,
  buildAuthRateLimitCustomRules,
  buildFieldEncryptionKeyringFromEnv,
  buildGoogleSocialConfigFromEnv,
  buildOtpAdaptersFromEnv,
  buildTrustedOriginsFromEnv,
} from './auth/bootstrap';
import {
  registerAppleAuthorizationCodeRoute,
  registerAuthExtraRoutes,
  registerMergeExecuteRoute,
  registerMergeTicketPreviewRoute,
  registerReturningPhoneSignInRoute,
} from './routes/auth-extra';
import { fixedCodeNumbersFromEnv } from './auth/otp/fixed-codes';
import { registerOtpWebhookRoutes } from './routes/otp-webhooks';
import { betterAuthSessionResolver } from './commands/_framework/session';
import { createAppCommandRegistry } from './commands/catalogue';
import { registerFeatureRoutes } from './feature-routes';
import { createMapboxRoutingProvider } from './routing/eta';
import { MapboxRoutingClient } from './routing/mapbox';
import { createClaimAttributionCommand } from './commands/attribution/claim-attribution';
import { registerInvites } from './commands/invites';
import { registerNudgeCommands } from './commands/nudges';
import { createLinkProviderRegistry } from './links/registry';
import {
  meterVendorCalls,
  redisCallSink,
  seatTokenKeyringFromJson,
  type LinkEnvironment,
} from '@cp/domain';
import { routeNotificationsFromApiEvents, startJobProducer } from './jobs/producer';
import { buildAdminConsole } from './admin/bootstrap';
import { registerSupportGrantSource } from './admin/entitlement-grants';
import { mountAdminRouter } from './admin/router';
import { createServerAnalytics } from './obs/analytics';
import { startApiObservability } from './obs';
import { createMetricsRecorder } from './obs/metrics';
import { createRequestPool } from './db-pool';
import { createRedisClient } from './redis-client';

const env = loadApiEnv();
const { logger, errors } = startApiObservability(env, packageJson.version);

const pool = createRequestPool(env.DATABASE_URL, env.DB_POOL_MAX, logger);

const redis = createRedisClient(env.REDIS_URL, logger);
// Connect in the background: readiness reports Redis until it is reachable, boot never blocks on it.
redis
  .connect()
  .catch((error: unknown) => logger.warn({ err: error }, 'redis initial connect failed'));
// Outbound vendor calls feed the console's Services screen (the worker's health collector).
meterVendorCalls(subscribe, redisCallSink(redis));

const routing =
  env.MAPBOX_TOKEN !== undefined
    ? createMapboxRoutingProvider({
        client: new MapboxRoutingClient({ accessToken: env.MAPBOX_TOKEN }),
        onProviderError: (error) => logger.warn({ err: error }, 'routing provider unavailable'),
      })
    : undefined;

/** The job producer has started: commands can queue their jobs, and /health reports ready. */
let jobsReady = false;

const app = createApp({
  service: 'api',
  version: packageJson.version,
  commit: env.COMMIT_SHA,
  logger,
  errors,
  exposeDocs: env.APP_ENV !== 'production',
  pool,
  ...(env.MAPBOX_TOKEN !== undefined ? { mapboxToken: env.MAPBOX_TOKEN } : {}),
  geocoding: {
    redis,
    mapboxMonthlyCap: env.MAPBOX_GEOCODE_MONTHLY_CAP,
    onMapboxCapReached: () =>
      logger.warn(
        { cap: env.MAPBOX_GEOCODE_MONTHLY_CAP },
        'mapbox geocode monthly cap reached: address search answers from our own places',
      ),
    onMapboxError: (error: unknown) => logger.warn({ err: error }, 'mapbox geocode failed'),
  },
  ...(routing !== undefined ? { routing } : {}),
  tilesBaseUrl: env.TILES_BASE_URL,
  ...(env.FOURSQUARE_API_KEY !== undefined
    ? {
        foursquare: {
          apiKey: env.FOURSQUARE_API_KEY,
          monthlyCallCap: env.FOURSQUARE_MONTHLY_CALL_CAP,
          onCapReached: (poiId: string) =>
            logger.warn(
              { poiId, cap: env.FOURSQUARE_MONTHLY_CALL_CAP },
              'foursquare monthly call cap reached: live place details unavailable',
            ),
          onError: (poiId: string, error: unknown) =>
            logger.warn({ poiId, err: error }, 'foursquare place details failed'),
        },
      }
    : {}),
  // Resolved per request, so the auth module created below is in place by then.
  sessions: (headers) => commandDoors.sessions(headers),
  // Until the job producer is up a command that queues work would fail: /health says "starting".
  started: () => jobsReady,
  readiness: {
    jobs: () =>
      jobsReady ? Promise.resolve() : Promise.reject(new Error('job producer not started')),
    db: async () => {
      await pool.query('select 1');
    },
    redis: async () => {
      if (!redis.isReady) throw new Error('redis not connected');
      await redis.ping();
    },
  },
});

// --- Better Auth: /api/auth/*, plus this phase's own routes riding alongside it
// (docs/api-contracts.md §5.1). Every provider/channel below is built only from the credentials
// actually present in env — an absent one is omitted, never faked (services/api/src/auth/bootstrap.ts).
const authModule = createAuthModule({
  appPool: pool,
  onPoolError: (error) => logger.error({ err: error }, 'auth database client error'),
  authDatabaseUrl: env.AUTH_DATABASE_URL,
  authPoolMax: env.AUTH_POOL_MAX,
  redis,
  secret: env.BETTER_AUTH_SECRET,
  baseUrl: `${env.PUBLIC_BASE_URL}/api/auth`,
  trustedOrigins: buildTrustedOriginsFromEnv(env),
  otpAdapters: buildOtpAdaptersFromEnv(env),
  fixedCodes: fixedCodeNumbersFromEnv(env, (warning) => logger.warn(warning)),
  onFixedCode: (use) => logger.warn(use, 'fixed-code phone number used for sign-in'),
  onOtpChannelFailure: (failure) => logger.warn(failure, 'otp channel send failed'),
  metrics: createMetricsRecorder({ strict: env.APP_ENV === 'local' }),
  rateLimit: { customRules: buildAuthRateLimitCustomRules(env) },
  attestation: buildAttestationConfigFromEnv(env),
  onAttestationFailure: (error, context) => {
    logger.warn({ err: error, ...context }, 'attestation check failed (log mode, request allowed)');
  },
  onAttestationVerified: (context) => {
    logger.info(context, 'attestation verified');
  },
  apple: buildAppleSocialConfigFromEnv(env),
  google: buildGoogleSocialConfigFromEnv(env),
  isProduction: env.APP_ENV === 'production',
});

// This phase's own routes that are not Better Auth endpoints (docs/api-contracts.md §5.1): the
// attestation challenge always registers (it needs only Redis), while the rest register only when
// their own dependencies are present.
registerAuthExtraRoutes(app, { redis });
registerMergeTicketPreviewRoute(app, {
  auth: authModule.auth,
  appPool: pool,
  secret: env.BETTER_AUTH_SECRET,
});
registerMergeExecuteRoute(app, {
  auth: authModule.auth,
  appPool: pool,
  redis,
  secret: env.BETTER_AUTH_SECRET,
});
registerReturningPhoneSignInRoute(app, {
  auth: authModule.auth,
  redis,
  secret: env.BETTER_AUTH_SECRET,
});

const appleSiwaConfig = buildAppleSiwaConfigFromEnv(env);
const fieldEncryptionKeyring = buildFieldEncryptionKeyringFromEnv(env);
if (appleSiwaConfig && fieldEncryptionKeyring) {
  registerAppleAuthorizationCodeRoute(app, {
    auth: authModule.auth,
    clientSecretConfig: appleSiwaConfig.clientSecretConfig,
    redirectUri: appleSiwaConfig.redirectUri,
    http: { fetch: (input, init) => fetch(input, init) },
    keyring: fieldEncryptionKeyring,
  });
} else {
  logger.info(
    'Sign in with Apple authorization-code capture is disabled: APPLE_SIWA_* or FIELD_ENCRYPTION_KEYS is unset',
  );
}

registerOtpWebhookRoutes(app, { env, appPool: pool, redis, logger });

// Send-only pg-boss for enqueue-in-transaction (docs/api-contracts-async.md §2.1), and notification
// routing for every domain event this process appends. Until the producer has started, a command
// that must enqueue fails retryably rather than dropping its job.
const jobProducer = startJobProducer({
  connectionString: env.DATABASE_DIRECT_URL ?? env.DATABASE_URL,
  max: env.JOBS_POOL_MAX,
  logger,
})
  .then((boss) => {
    jobsReady = true;
    logger.info('job producer started');
    return boss;
  })
  .catch((error: unknown) => {
    // Never ready: the platform keeps the previous deployment serving and reports this one failed.
    logger.error({ err: error }, 'job producer failed to start; enqueueing commands will fail');
    return undefined;
  });
routeNotificationsFromApiEvents();

// Support's time-boxed perk grants are one more entitlement source, console or not.
registerSupportGrantSource();

// Request-time analytics (link clicks, widget actions); consent-gated, off without a PostHog key.
const serverAnalytics = createServerAnalytics({
  pool,
  projectApiKey: env.POSTHOG_PROJECT_API_KEY,
  pidSalt: env.ANALYTICS_PID_SALT,
  host: env.POSTHOG_HOST,
  onError: (error) => logger.warn({ err: error }, 'server analytics failed'),
});

// The three command doors over one registry (docs/api-contracts.md §2.2, §5.2).
const commands = createAppCommandRegistry({
  onInstallStandIn: (standIn) =>
    logger.info(standIn, 'command ran on the caller’s registered device, not the envelope’s'),
});

// Links (docs/api-contracts.md §5.6): providers per link kind, the claim command, public routes.
const linkProviders = createLinkProviderRegistry();
const LINK_ENVIRONMENT_BY_APP_ENV: Record<typeof env.APP_ENV, LinkEnvironment> = {
  production: 'production',
  staging: 'staging',
  local: 'development',
};
const seatKeys =
  env.SEAT_TOKEN_KEYS !== undefined && env.SEAT_TOKEN_ACTIVE_KID !== undefined
    ? seatTokenKeyringFromJson(env.SEAT_TOKEN_KEYS, env.SEAT_TOKEN_ACTIVE_KID).keys
    : {};
const linkEnv = LINK_ENVIRONMENT_BY_APP_ENV[env.APP_ENV];
registerInvites(commands, linkProviders, env, linkEnv, fieldEncryptionKeyring);
registerNudgeCommands(commands, { linkEnv });
commands.register(
  createClaimAttributionCommand({
    registry: linkProviders,
    config: { env: linkEnv, seatKeys },
  }),
);
const commandDoors = {
  pool,
  registry: commands,
  sessions: betterAuthSessionResolver(authModule.auth.api),
  redis,
  logger,
};
registerFeatureRoutes(app, {
  env,
  doors: commandDoors,
  auth: authModule.auth,
  keyring: fieldEncryptionKeyring,
  links: linkProviders,
  analytics: serverAnalytics,
});

// Ops console (/v1/admin/*): its own Better Auth instance, guard and audited command pipeline.
const adminConsole = buildAdminConsole(env, {
  pool,
  redis,
  logger,
  appAuth: authModule.auth,
  jobs: { boss: () => jobProducer, redis },
});
if (adminConsole) {
  mountAdminRouter(app, adminConsole.router);
} else {
  logger.info('Ops console routes are disabled: ADMIN_PUBLIC_ORIGIN or ADMIN_ALLOWLIST is unset');
}

// Mounted last: Better Auth's own catch-all handler must never shadow the more specific routes
// above (`/api/auth/sign-in/phone-number` in particular — registerReturningPhoneSignInRoute wins
// over Better Auth's own password-based endpoint of the same name only because Hono matches the
// first registered route).
mountAuthHandler(app, authModule, { pool, logger });

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'api listening');
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'draining');
  server.close(() => {
    void Promise.allSettled([
      pool.end(),
      redis.isOpen ? redis.close() : Promise.resolve(),
      authModule.close(),
      jobProducer.then((boss) => boss?.stop({ graceful: true, timeout: 5_000 })),
      adminConsole?.close() ?? Promise.resolve(),
      serverAnalytics.shutdown(),
      errors.flush(),
    ]).then(() => {
      logger.info('stopped');
      process.exit(0);
    });
  });
  // Railway sends SIGKILL after its drain window; exit before that with whatever finished.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
