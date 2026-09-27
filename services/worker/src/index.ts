import { serve } from '@hono/node-server';
import pg from 'pg';
import { pino } from 'pino';
import { createClient } from 'redis';

import packageJson from '../package.json' with { type: 'json' };

import { loadWorkerEnv } from './env';
import {
  createBoss,
  createFailureReporter,
  startJobRuntime,
  stopJobRuntime,
  type AnyJobDefinition,
} from './boss';
import { createHealthApp } from './health';
import { enqueueDueJob } from './jobs/sched/enqueue-due';
import { createCentrifugoApi, rtRelayJob, startRtRelayWake, type RtRelay } from './rt-relay';

const env = loadWorkerEnv();
const logger = pino({ level: env.LOG_LEVEL, base: { service: 'worker', commit: env.COMMIT_SHA } });

const pool = new pg.Pool({
  connectionString: env.DATABASE_DIRECT_URL,
  max: 10,
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

const jobs: AnyJobDefinition[] = [enqueueDueJob()];
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

const jobsLogger = logger.child({ component: 'jobs' });
const boss = createBoss({ connectionString: env.DATABASE_DIRECT_URL, logger: jobsLogger });
let rtRelay: RtRelay | undefined;
const runtime = startJobRuntime({
  boss,
  deps: { pool, logger: jobsLogger },
  jobs,
  report: createFailureReporter(jobsLogger),
})
  .then(() => {
    jobsLogger.info({ queues: jobs.map((job) => job.queue) }, 'job runtime started');
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
  server.close(() => {
    void runtime
      .then(() => rtRelay?.stop())
      .then(() => stopJobRuntime(boss))
      .catch((error: unknown) => logger.error({ err: error }, 'job runtime stop failed'))
      .then(() =>
        Promise.allSettled([pool.end(), redis.isOpen ? redis.close() : Promise.resolve()]),
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
