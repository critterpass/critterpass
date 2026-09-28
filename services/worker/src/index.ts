import { resolveRoute } from '@cp/ai';
import { createKillSwitchReader, onEventAppended } from '@cp/db';
import { serve } from '@hono/node-server';
import pg from 'pg';
import { createClient } from 'redis';

import packageJson from '../package.json' with { type: 'json' };

import { aiJobs } from './ai';
import { contentJobs } from './content';
import { createPostHogSink, startExportLoop, type ExportLoop } from './analytics-export';
import { loadWorkerEnv } from './env';
import {
  createBoss,
  createFailureReporter,
  startJobRuntime,
  stopJobRuntime,
  type AnyJobDefinition,
} from './boss';
import { guideActionExecuteJob, guideActionUndoExpireJob } from './guide-actions';
import { createHealthApp } from './health';
import { createWorkerLlmObservability } from './obs/langfuse';
import { createLogger } from './obs/logger';
import { createMetricsRecorder } from './obs/metrics';
import { initWorkerSentry } from './obs/sentry';
import { avatarJobs } from './jobs/avatar';
import { chatJobs, registerChatNotifications } from './jobs/chat';
import { anonGcJob } from './jobs/maint/anon-gc';
import { purgeJob } from './jobs/maint/purge';
import { fixesTtlJob } from './jobs/location/fixes-ttl';
import { visitsTtlJob } from './jobs/location/visits-ttl';
import { startWorkerHeartbeat } from './boss/heartbeat';
import { aiCostGuardJob } from './jobs/ops/ai-cost-guard';
import { inviteJobs, registerInviteNotifications } from './jobs/invites';
import { backupJob } from './jobs/ops/backup';
import { createObjectStore } from './jobs/ops/object-store';
import { enqueueDueJob } from './jobs/sched/enqueue-due';
import { notifyRouteJob, routeEventHook } from './jobs/notify';
import { pushSendJob } from './jobs/push/send';
import { roundupBuildJob, roundupScanJob } from './jobs/roundup/build';
import { createCopyRenderer, createPushProviders, defaultBundleId } from './push';
import { createCentrifugoApi, rtRelayJob, startRtRelayWake, type RtRelay } from './rt-relay';
import { travelDataJobs } from './travel-data';
import { costRecomputeJob } from './cost/recompute';

const env = loadWorkerEnv();
const logger = createLogger({ level: env.LOG_LEVEL, service: 'worker', commit: env.COMMIT_SHA });
const errors = initWorkerSentry({
  dsn: env.SENTRY_DSN,
  environment: env.APP_ENV,
  release: `worker@${packageJson.version}+${env.COMMIT_SHA}`,
});

// Handlers' transactions carry no session state (SET LOCAL only), so they go through PgBouncer.
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL ?? env.DATABASE_DIRECT_URL,
  max: env.DB_POOL_MAX,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 30_000,
});
pool.on('error', (error) => logger.error({ err: error }, 'idle database client error'));

const redis = createClient({ url: env.REDIS_URL, socket: { connectTimeout: 2000 } });
redis.on('error', (error: unknown) => logger.warn({ err: error }, 'redis connection error'));
redis
  .connect()
  .catch((error: unknown) => logger.warn({ err: error }, 'redis initial connect failed'));

const health = createHealthApp({
  version: packageJson.version,
  commit: env.COMMIT_SHA,
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

const metrics = createMetricsRecorder({ strict: env.APP_ENV === 'local' });
const llmObservability = createWorkerLlmObservability({
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  secretKey: env.LANGFUSE_SECRET_KEY,
  host: env.LANGFUSE_HOST,
  environment: env.APP_ENV,
  metrics,
  ...(env.POSTHOG_PROJECT_API_KEY
    ? {
        sink: createPostHogSink({
          apiKey: env.POSTHOG_PROJECT_API_KEY,
          ...(env.POSTHOG_HOST ? { host: env.POSTHOG_HOST } : {}),
        }),
      }
    : {}),
  onError: (error) => logger.warn({ err: error }, 'llm observability export failed'),
});

// One kill-switch reader per process: every AI call checks its route, tier and the cost guard's pause.
const aiSwitches = createKillSwitchReader(pool, { tierOf: (route) => resolveRoute(route).tier });

const jobs: AnyJobDefinition[] = [
  enqueueDueJob(),
  purgeJob(),
  aiCostGuardJob(),
  anonGcJob(),
  fixesTtlJob(),
  visitsTtlJob(),
  ...inviteJobs(),
  guideActionExecuteJob(),
  guideActionUndoExpireJob(),
  ...aiJobs(
    env,
    (error) => logger.warn({ err: error }, 'langfuse export failed'),
    llmObservability,
    aiSwitches.assertAiRoute,
  ),
  ...travelDataJobs(
    env,
    pool,
    logger.child({ component: 'travel-data' }),
    aiSwitches.assertAiRoute,
  ),
  ...contentJobs(),
  costRecomputeJob,
  ...avatarJobs(env, aiSwitches.assertAiRoute, llmObservability),
  ...chatJobs(env),
];
const backupStore =
  env.BACKUP_S3_ENDPOINT &&
  env.BACKUP_S3_BUCKET &&
  env.BACKUP_S3_ACCESS_KEY_ID &&
  env.BACKUP_S3_SECRET_ACCESS_KEY
    ? createObjectStore({
        endpoint: env.BACKUP_S3_ENDPOINT,
        bucket: env.BACKUP_S3_BUCKET,
        accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
        secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
        region: env.BACKUP_S3_REGION,
      })
    : undefined;
if (env.APP_ENV !== 'local' || (backupStore && env.BACKUP_DATABASE_URL)) {
  jobs.push(
    backupJob({
      databaseUrl: env.BACKUP_DATABASE_URL,
      store: backupStore,
      pgDump: [env.BACKUP_PG_DUMP_PATH],
    }),
  );
}
const relayEnabled = Boolean(env.CENTRIFUGO_API_URL && env.CENTRIFUGO_HTTP_API_KEY);
if (env.CENTRIFUGO_API_URL && env.CENTRIFUGO_HTTP_API_KEY) {
  jobs.push(
    rtRelayJob(
      createCentrifugoApi({ baseUrl: env.CENTRIFUGO_API_URL, apiKey: env.CENTRIFUGO_HTTP_API_KEY }),
    ),
  );
} else {
  logger.warn(
    'rt_outbox relay is disabled: CENTRIFUGO_API_URL or CENTRIFUGO_HTTP_API_KEY is unset',
  );
}

// Notifications (docs/api-contracts-async.md §2.2): routing, the evening roundup and delivery.
// Domain events appended in this process enqueue their routing jobs in the same transaction.
const renderer = createCopyRenderer();
const pushProviders = createPushProviders(env);
if (!pushProviders.apns)
  logger.warn('APNs is not configured: iOS pushes will be recorded as failed');
if (!pushProviders.fcm)
  logger.warn('FCM is not configured: Android pushes will be recorded as failed');
const roundupBuild = roundupBuildJob({ renderer });
jobs.push(
  notifyRouteJob({ renderer }),
  pushSendJob({ ...pushProviders, renderer, defaultBundleId: defaultBundleId(env.APP_ENV) }),
  roundupBuild,
  roundupScanJob(roundupBuild),
);
onEventAppended(routeEventHook);
registerInviteNotifications();
registerChatNotifications();

// Domain events → PostHog (consent-gated, idempotent on the event id).
let analyticsExport: ExportLoop | undefined;
if (env.POSTHOG_PROJECT_API_KEY && env.ANALYTICS_PID_SALT) {
  const analyticsLogger = logger.child({ component: 'analytics-export' });
  analyticsExport = startExportLoop({
    pool,
    sink: createPostHogSink({
      apiKey: env.POSTHOG_PROJECT_API_KEY,
      ...(env.POSTHOG_HOST ? { host: env.POSTHOG_HOST } : {}),
    }),
    pidSalt: env.ANALYTICS_PID_SALT,
    onError: (error) => analyticsLogger.warn({ err: error }, 'analytics export failed'),
  });
} else {
  logger.warn(
    'analytics export is disabled: POSTHOG_PROJECT_API_KEY or ANALYTICS_PID_SALT is unset',
  );
}

const jobsLogger = logger.child({ component: 'jobs' });
const boss = createBoss({
  connectionString: env.DATABASE_DIRECT_URL,
  max: env.JOBS_POOL_MAX,
  logger: jobsLogger,
});
let rtRelay: RtRelay | undefined;
let stopHeartbeat: (() => void) | undefined;
const runtime = startJobRuntime({
  boss,
  deps: { pool, logger: jobsLogger },
  jobs,
  report: createFailureReporter(jobsLogger, errors.deadLetter),
})
  .then(() => {
    jobsLogger.info({ queues: jobs.map((job) => job.queue) }, 'job runtime started');
    stopHeartbeat = startWorkerHeartbeat(redis, jobsLogger);
    if (relayEnabled) {
      rtRelay = startRtRelayWake({
        pool,
        boss,
        logger: logger.child({ component: 'rt-relay' }),
        connectListener: () => new pg.Client({ connectionString: env.DATABASE_DIRECT_URL }),
      });
    }
  })
  .catch((error: unknown) => {
    jobsLogger.fatal({ err: error }, 'job runtime failed to start');
    process.exit(1);
  });

const server = serve({ fetch: health.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'worker health listening');
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'draining');
  stopHeartbeat?.();
  server.close(() => {
    void runtime
      .then(() => rtRelay?.stop())
      .then(() => analyticsExport?.stop())
      .then(() => stopJobRuntime(boss))
      .then(() => pushProviders.shutdown())
      .catch((error: unknown) => logger.error({ err: error }, 'job runtime stop failed'))
      .then(() =>
        Promise.allSettled([
          pool.end(),
          redis.isOpen ? redis.close() : Promise.resolve(),
          errors.flush(),
        ]),
      )
      .then(() => {
        logger.info('stopped');
        process.exit(0);
      });
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
