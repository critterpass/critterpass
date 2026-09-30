import { resolveRoute } from '@cp/ai';
import { createKillSwitchReader, onEventAppended, watchPoolErrors } from '@cp/db';
import { serve } from '@hono/node-server';
import pg from 'pg';
import { createClient } from 'redis';

import packageJson from '../package.json' with { type: 'json' };

import { createPostHogSink, startExportLoop, type ExportLoop } from './analytics-export';
import { loadWorkerEnv } from './env';
import { createBoss, createFailureReporter, startJobRuntime, stopJobRuntime } from './boss';
import { createHealthApp } from './health';
import { buildJobRegistry } from './job-registry';
import { createWorkerLlmObservability } from './obs/langfuse';
import { createLogger } from './obs/logger';
import { createMetricsRecorder } from './obs/metrics';
import { initWorkerSentry } from './obs/sentry';
import { registerChatNotifications } from './jobs/chat';
import { registerLiveMapNotifications } from './jobs/live-map';
import { inboxEventHook, registerHomeInboxFanouts, registerHomeRetention } from './jobs/inbox';
import { registerNudgeNotifications } from './jobs/nudges';
import { countdownEventHook } from './jobs/countdown';
import { registerPollFanouts } from './jobs/polls';
import { tipsEventHook } from './jobs/tips';
import { registerPitchTipCandidates } from './jobs/pitches';
import { registerSetupPushes } from './jobs/setup';
import { registerMoneyPushes } from './jobs/money';
import { registerCritterPushes } from './jobs/critters/pushes';
import { startWorkerHeartbeat } from './boss/heartbeat';
import { registerInviteNotifications } from './jobs/invites';
import { routeEventHook } from './jobs/notify';
import { createCopyRenderer, createPushProviders } from './push';
import { startRtRelayWake, type RtRelay } from './rt-relay';

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
watchPoolErrors(pool, (error) =>
  logger.error({ err: error, pool: 'jobs' }, 'database client error'),
);

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

const renderer = createCopyRenderer();
const pushProviders = createPushProviders(env);
if (!pushProviders.apns)
  logger.warn('APNs is not configured: iOS pushes will be recorded as failed');
if (!pushProviders.fcm)
  logger.warn('FCM is not configured: Android pushes will be recorded as failed');
const relayEnabled = Boolean(env.CENTRIFUGO_API_URL && env.CENTRIFUGO_HTTP_API_KEY);
const jobs = await buildJobRegistry({
  env,
  processEnv: process.env,
  pool,
  logger,
  aiSwitches,
  llmObservability,
  metrics,
  renderer,
  pushProviders,
});
// Domain events appended in this process enqueue their routing jobs in the same transaction.
for (const hook of [routeEventHook, inboxEventHook, countdownEventHook, tipsEventHook])
  onEventAppended(hook);
registerHomeInboxFanouts();
registerHomeRetention();
registerNudgeNotifications();
registerPollFanouts();
registerPitchTipCandidates();
registerInviteNotifications();
registerChatNotifications();
registerLiveMapNotifications();
registerSetupPushes();
registerMoneyPushes();
registerCritterPushes();

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
