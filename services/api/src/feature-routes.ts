import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from './app';
import type { AuthModule } from './auth';
import type { buildFieldEncryptionKeyringFromEnv } from './auth/bootstrap';
import type { CommandDoorDeps } from './commands/_framework/doors';
import { registerSetupRoutes } from './commands/catalogue';
import type { ApiEnv } from './env';
import type { LinkProviderRegistry } from './links/registry';
import type { ServerAnalytics } from './obs/analytics';
import type { startApiObservability } from './obs';
import type { createRedisClient } from './redis-client';
import { registerCmdResultsRoute } from './routes/cmd-results';
import { registerCommandRoute } from './routes/cmd';
import { registerLocationRouteFromEnv } from './routes/loc';
import { registerLiveMapRoutes } from './routes/live-map';
import { registerSyncUploadRoute } from './routes/sync-upload';
import { registerAiRoutes } from './ai/routes';
import { registerVoteRoutesFromEnv } from './routes/vote-routes';
import { registerTravelDataRoutes } from './travel-data/routes';
import { registerCostRoutes } from './cost/routes';
import { registerPlanRoutes } from './plan/routes';
import { createR2Client } from './media/r2';
import { mediaSigningConfigFromEnv } from './media/sign';
import { registerDevRoutesFromEnv } from './dev/routes';
import { registerGeoRoutesFromEnv } from './routes/geo';
import { registerMediaRoutes } from './routes/media';
import { registerMoneyRoutes, registerReceiptRoutesFromEnv } from './money/routes';
import { registerBookings } from './bookings/register';
import { registerLinkRoutes } from './routes/links';
import { registerActionKeyRoutes } from './routes/action-keys';
import { registerActionsRoute } from './routes/actions';
import { registerNotificationRoutes } from './routes/notifications';
import { registerInternalRtRoutes } from './routes/internal-rt';
import { registerBilling } from './billing/register';
import { registerGuideRoutes } from './routes/guide';
import { registerSupplierRoutes } from './suppliers/register';
import { registerTripDay } from './commands/trip-day';
import { registerExplore } from './explore/register';
import { registerProposals } from './routes/proposals';

/** The command doors as the api boots them: its own Redis client and logger. */
export interface ApiCommandDoors extends CommandDoorDeps {
  readonly redis: ReturnType<typeof createRedisClient>;
  readonly logger: ReturnType<typeof startApiObservability>['logger'];
}

export interface FeatureRouteDeps {
  readonly env: ApiEnv;
  readonly doors: ApiCommandDoors;
  readonly auth: AuthModule['auth'];
  readonly keyring: ReturnType<typeof buildFieldEncryptionKeyringFromEnv>;
  readonly links: LinkProviderRegistry;
  readonly analytics: ServerAnalytics;
}

/**
 * Every feature's routes over the command doors, in registration order. A feature adds its one
 * registration line here; index.ts keeps the boot (env, pools, auth, jobs, console, shutdown).
 */
export function registerFeatureRoutes(app: OpenAPIHono<AppEnv>, deps: FeatureRouteDeps): void {
  const { env, doors, keyring } = deps;
  const { pool, redis, logger } = doors;
  registerBilling({ app, commands: doors.registry, pool: doors.pool, logger: doors.logger });
  registerCommandRoute(app, doors);
  registerSyncUploadRoute(app, doors);
  registerCmdResultsRoute(app, doors);
  registerBookings(app, doors, keyring, deps.auth);
  registerLocationRouteFromEnv(app, doors, env);
  registerLiveMapRoutes(app, doors);
  registerAiRoutes(app, doors, env, logger);
  registerGuideRoutes(app, doors, env, keyring);
  registerTripDay(doors);
  registerProposals(app, doors, env, keyring);
  registerVoteRoutesFromEnv(app, { ...doors, cache: redis }, env);
  registerTravelDataRoutes(app, doors);
  registerCostRoutes(app, doors);
  registerPlanRoutes(app, doors);
  registerSupplierRoutes(app, doors);
  registerExplore(app, doors);
  registerSetupRoutes(app, { ...doors, store: redis, env: process.env });
  registerReceiptRoutesFromEnv(app, doors, process.env);
  registerGeoRoutesFromEnv(app, doors, env.GEOIP_CITY_MMDB, logger);
  registerDevRoutesFromEnv(app, { ...doors, logger }, env);
  registerLinkRoutes(app, {
    ...doors,
    links: deps.links,
    webProxySecret: env.LINKS_WEB_PROXY_SECRET,
    analytics: deps.analytics,
  });
  // Device action keys and the doors they open (docs/api-contracts-async.md §5): keys are stored
  // envelope-encrypted, so every route here needs the field-encryption keyring.
  if (keyring) {
    const actionDeps = { ...doors, keyring };
    registerActionKeyRoutes(app, actionDeps);
    registerActionsRoute(app, { ...actionDeps, analytics: deps.analytics });
    registerNotificationRoutes(app, actionDeps);
    registerMoneyRoutes(app, actionDeps);
  } else {
    logger.warn('Device action keys and /v1/actions are disabled: FIELD_ENCRYPTION_KEYS is unset');
  }
  if (env.RT_PROXY_SECRET) {
    registerInternalRtRoutes(app, { pool, redis, proxySecret: env.RT_PROXY_SECRET });
  } else {
    logger.warn('Centrifugo proxies are disabled: RT_PROXY_SECRET is unset');
  }
  registerMediaRoutesFromEnv(app, doors, env);
}

function registerMediaRoutesFromEnv(
  app: OpenAPIHono<AppEnv>,
  doors: ApiCommandDoors,
  env: ApiEnv,
): void {
  if (
    !env.R2_S3_ENDPOINT ||
    !env.R2_BUCKET ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.MEDIA_PUBLIC_BASE_URL ||
    !env.MEDIA_HMAC_KEYS ||
    !env.MEDIA_HMAC_ACTIVE_KID
  ) {
    doors.logger.info('Media routes are disabled: R2_* or MEDIA_* is unset');
    return;
  }
  registerMediaRoutes(app, {
    ...doors,
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
}
