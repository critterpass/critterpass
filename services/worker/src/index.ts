import { serve } from '@hono/node-server';
import pg from 'pg';
import { pino } from 'pino';
import { createClient } from 'redis';

import packageJson from '../package.json' with { type: 'json' };

import { loadWorkerEnv } from './env';
import { createHealthApp } from './health';

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

const server = serve({ fetch: health.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port }, 'worker health listening');
});

let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'draining');
  server.close(() => {
    void Promise.allSettled([pool.end(), redis.isOpen ? redis.close() : Promise.resolve()]).then(
      () => {
        logger.info('stopped');
        process.exit(0);
      },
    );
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
