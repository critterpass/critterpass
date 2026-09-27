import { serve } from '@hono/node-server';
import pg from 'pg';
import { pino } from 'pino';
import { createClient } from 'redis';

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
import { registerInternalRtRoutes } from './routes/internal-rt';
import { registerWhatsAppWebhookRoutes } from './routes/webhooks-whatsapp';
import { createCommandRegistry } from './commands/_framework/registry';
import { registerDeviceCommands } from './commands/device';
import { approveOpsActionCommand } from './commands/approve-ops-action';
import { reportContentCommand } from './commands/report-content';
import { betterAuthSessionResolver } from './commands/_framework/session';
import { registerCmdResultsRoute } from './routes/cmd-results';
import { registerCommandRoute } from './routes/cmd';
import { registerSyncUploadRoute } from './routes/sync-upload';
import { registerJobsRoute } from './ai/jobs-route';
import { registerTravelDataRoutes } from './travel-data/routes';
import { undoGuideActionCommand } from './ai/undo-guide-action';
import { createR2Client } from './media/r2';
import { registerMediaUploadCommand } from './media/register-media-upload';
import { mediaSigningConfigFromEnv } from './media/sign';
import { registerMediaRoutes } from './routes/media';
import { createMapboxRoutingProvider } from './routing/eta';
import { MapboxRoutingClient } from './routing/mapbox';
import { createClaimAttributionCommand } from './commands/attribution/claim-attribution';
import { joinCodeProvider } from './links/join-code-provider';
import { createLinkProviderRegistry } from './links/registry';
import { registerLinkRoutes } from './routes/links';
import { seatTokenKeyringFromJson, type LinkEnvironment } from '@cp/domain';
import { registerActionKeyRoutes } from './routes/action-keys';
import { registerActionsRoute } from './routes/actions';
import { registerNotificationRoutes } from './routes/notifications';
import { routeNotificationsFromApiEvents, startJobProducer } from './jobs/producer';
import { buildAdminConsole } from './admin/bootstrap';
import { registerSupportGrantSource } from './admin/entitlement-grants';
import { mountAdminRouter } from './admin/router';
import { createServerAnalytics } from './obs/analytics';

const env = loadApiEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: 'api', commit: env.COMMIT_SHA } });

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30_000,
});
pool.on('error', (error) => logger.error({ err: error }, 'idle database client error'));

const redis = createClient({ url: env.REDIS_URL, socket: { connectTimeout: 2000 } });
redis.on('error', (error: unknown) => logger.warn({ err: error }, 'redis connection error'));
// Connect in the background: readiness reports Redis until it is reachable, boot never blocks on it.
redis
  .connect()
  .catch((error: unknown) => logger.warn({ err: error }, 'redis initial connect failed'));

const routing =
  env.MAPBOX_TOKEN !== undefined
    ? createMapboxRoutingProvider({
        client: new MapboxRoutingClient({ accessToken: env.MAPBOX_TOKEN }),
        onProviderError: (error) => logger.warn({ err: error }, 'routing provider unavailable'),
      })
    : undefined;

const app = createApp({
  service: 'api',
  version: packageJson.version,
  commit: env.COMMIT_SHA,
  logger,
  exposeDocs: env.APP_ENV !== 'production',
  pool,
  ...(env.MAPBOX_TOKEN !== undefined ? { mapboxToken: env.MAPBOX_TOKEN } : {}),
  ...(routing !== undefined ? { routing } : {}),
  tilesBaseUrl: env.TILES_BASE_URL,
  readiness: {
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
  onPoolError: (error) => logger.error({ err: error }, 'idle auth database client error'),
  authDatabaseUrl: env.AUTH_DATABASE_URL,
  redis,
  secret: env.BETTER_AUTH_SECRET,
  baseUrl: `${env.PUBLIC_BASE_URL}/api/auth`,
  trustedOrigins: buildTrustedOriginsFromEnv(env),
  otpAdapters: buildOtpAdaptersFromEnv(env),
  rateLimit: { customRules: buildAuthRateLimitCustomRules() },
  attestation: buildAttestationConfigFromEnv(env),
  onAttestationFailure: (error, context) => {
    logger.warn({ err: error, ...context }, 'attestation check failed (log mode, request allowed)');
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

if (env.WHATSAPP_APP_SECRET && env.WHATSAPP_VERIFY_TOKEN) {
  registerWhatsAppWebhookRoutes(app, {
    appPool: pool,
    redis,
    appSecret: env.WHATSAPP_APP_SECRET,
    verifyToken: env.WHATSAPP_VERIFY_TOKEN,
  });
} else {
  logger.info(
    'WhatsApp status webhook is disabled: WHATSAPP_APP_SECRET or WHATSAPP_VERIFY_TOKEN is unset',
  );
}

// Send-only pg-boss for enqueue-in-transaction (docs/api-contracts-async.md §2.1), and notification
// routing for every domain event this process appends. Until the producer has started, a command
// that must enqueue fails retryably rather than dropping its job.
const jobProducer = startJobProducer({
  connectionString: env.DATABASE_DIRECT_URL ?? env.DATABASE_URL,
  logger,
}).catch((error: unknown) => {
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
const commands = createCommandRegistry();
commands.register(registerMediaUploadCommand);
registerDeviceCommands(commands);
commands.register(undoGuideActionCommand);
commands.register(reportContentCommand);
commands.register(approveOpsActionCommand);

// Links (docs/api-contracts.md §5.6): providers per link kind, the claim command, public routes.
const linkProviders = createLinkProviderRegistry();
linkProviders.register(joinCodeProvider);
const LINK_ENVIRONMENT_BY_APP_ENV: Record<typeof env.APP_ENV, LinkEnvironment> = {
  production: 'production',
  staging: 'staging',
  local: 'development',
};
const seatKeys =
  env.SEAT_TOKEN_KEYS !== undefined && env.SEAT_TOKEN_ACTIVE_KID !== undefined
    ? seatTokenKeyringFromJson(env.SEAT_TOKEN_KEYS, env.SEAT_TOKEN_ACTIVE_KID).keys
    : {};
commands.register(
  createClaimAttributionCommand({
    registry: linkProviders,
    config: { env: LINK_ENVIRONMENT_BY_APP_ENV[env.APP_ENV], seatKeys },
  }),
);
const commandDoors = {
  pool,
  registry: commands,
  sessions: betterAuthSessionResolver(authModule.auth.api),
  redis,
  logger,
};
registerCommandRoute(app, commandDoors);
registerSyncUploadRoute(app, commandDoors);
registerCmdResultsRoute(app, commandDoors);
registerJobsRoute(app, commandDoors);
registerTravelDataRoutes(app, commandDoors);
registerLinkRoutes(app, {
  ...commandDoors,
  links: linkProviders,
  webProxySecret: env.LINKS_WEB_PROXY_SECRET,
  analytics: serverAnalytics,
});
// Device action keys and the doors they open (docs/api-contracts-async.md §5): keys are stored
// envelope-encrypted, so every route here needs the field-encryption keyring.
if (fieldEncryptionKeyring) {
  const actionDeps = {
    pool,
    registry: commands,
    sessions: commandDoors.sessions,
    redis,
    keyring: fieldEncryptionKeyring,
  };
  registerActionKeyRoutes(app, actionDeps);
  registerActionsRoute(app, { ...actionDeps, analytics: serverAnalytics });
  registerNotificationRoutes(app, actionDeps);
} else {
  logger.warn('Device action keys and /v1/actions are disabled: FIELD_ENCRYPTION_KEYS is unset');
}
if (env.RT_PROXY_SECRET) {
  registerInternalRtRoutes(app, { pool, redis, proxySecret: env.RT_PROXY_SECRET });
} else {
  logger.warn('Centrifugo proxies are disabled: RT_PROXY_SECRET is unset');
}

if (
  env.R2_S3_ENDPOINT &&
  env.R2_BUCKET &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.MEDIA_PUBLIC_BASE_URL &&
  env.MEDIA_HMAC_KEYS &&
  env.MEDIA_HMAC_ACTIVE_KID
) {
  registerMediaRoutes(app, {
    ...commandDoors,
    r2: createR2Client({
      endpoint: env.R2_S3_ENDPOINT,
      bucket: env.R2_BUCKET,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    }),
    signing: mediaSigningConfigFromEnv({
      baseUrl: env.MEDIA_PUBLIC_BASE_URL,
      keysJson: env.MEDIA_HMAC_KEYS,
      activeKeyId: env.MEDIA_HMAC_ACTIVE_KID,
    }),
  });
} else {
  logger.info('Media routes are disabled: R2_* or MEDIA_* is unset');
}

// Ops console (/v1/admin/*): its own Better Auth instance, guard and audited command pipeline.
const adminConsole = buildAdminConsole(env, { pool, redis, logger, appAuth: authModule.auth });
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
