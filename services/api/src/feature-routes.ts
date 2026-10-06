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
import { registerConfigRoutesFromEnv } from './routes/config';
import { registerCommandRoute } from './routes/cmd';
import { registerLocationRouteFromEnv } from './routes/loc';
import { registerLiveMapRoutes } from './routes/live-map';
import { registerSyncUploadRoute } from './routes/sync-upload';
import { registerAiRoutes } from './ai/routes';
import { registerVoteRoutesFromEnv } from './routes/vote-routes';
import { registerTravelDataRoutes } from './travel-data/routes';
import { registerEditorialMediaRoute } from './editorial-media/route';
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
import { registerPublicPreviewRoutes } from './routes/public-previews';
import { registerActionKeyRoutes } from './routes/action-keys';
import { registerActionsRoute } from './routes/actions';
import { registerNotificationRoutes } from './routes/notifications';
import { registerWidgetSnapshotRoute } from './routes/widgets-snapshot';
import { registerInternalRtRoutes } from './routes/internal-rt';
import { registerBilling } from './billing/register';
import { registerGuideRoutes } from './routes/guide';
import { registerHelpArticleRoutes } from './routes/help-articles';
import { registerSharedContentRoutes } from './routes/shared-content';
import { registerSupplierRoutes } from './suppliers/register';
import { registerTripDay } from './commands/trip-day';
import { registerDisruptions } from './commands/disruptions';
import { registerExplore } from './explore/register';
import { registerPlanning } from './planning/register';
import { registerProposals } from './routes/proposals';
import { registerCritters } from './commands/critters';
import { registerQuests } from './commands/quests';
import { registerTripLifecycle } from './commands/trips/lifecycle';
import { registerRecap } from './commands/recap';
import { registerAlbum } from './commands/album';
import { registerLiveActivities } from './commands/live-activities';
import { guardClosedAccounts } from './account/closed-guard';
import { registerAccount } from './account/register';
import { registerSafety } from './commands/safety';

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
  const { env, keyring } = deps;
  // A closed account may only restore itself, whichever door it knocks on.
  const doors = { ...deps.doors, registry: guardClosedAccounts(deps.doors.registry) };
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
  registerDisruptions(app, doors);
  registerProposals(app, doors, env, keyring);
  registerCritters(doors);
  registerQuests(doors);
  registerTripLifecycle(doors);
  registerRecap(doors);
  registerAlbum(doors);
  registerLiveActivities(doors);
  registerSafety(app, doors, env, keyring);
  registerVoteRoutesFromEnv(app, { ...doors, cache: redis }, env);
  registerHelpArticleRoutes(app, doors);
  registerSharedContentRoutes(app, doors);
  registerTravelDataRoutes(app, doors);
  if (env.MEDIA_PUBLIC_BASE_URL) {
    registerEditorialMediaRoute(app, { ...doors, publicBaseUrl: env.MEDIA_PUBLIC_BASE_URL });
  }
  registerCostRoutes(app, doors);
  registerPlanRoutes(app, doors);
  registerSupplierRoutes(app, doors);
  registerExplore(app, doors);
  registerPlanning(app, doors, env);
  registerSetupRoutes(app, { ...doors, store: redis, env: process.env });
  registerReceiptRoutesFromEnv(app, doors, process.env);
  registerConfigRoutesFromEnv(app, doors, process.env);
  registerGeoRoutesFromEnv(app, doors, env.GEOIP_CITY_MMDB, logger);
  registerDevRoutesFromEnv(app, { ...doors, logger }, env);
  registerLinkRoutes(app, {
    ...doors,
    links: deps.links,
    webProxySecret: env.LINKS_WEB_PROXY_SECRET,
    analytics: deps.analytics,
  });
  registerPublicPreviewRoutes(app, { ...doors, webProxySecret: env.LINKS_WEB_PROXY_SECRET });
  registerWidgetSnapshotRoute(app, { ...doors, ...(keyring ? { keyring } : {}) });
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
  registerAccount(app, { doors, auth: deps.auth, env, keyring });
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
