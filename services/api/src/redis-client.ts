import type { Logger } from 'pino';
import { createClient } from 'redis';

/**
 * The api's shared Redis client. A dropped socket emits `error` (which would crash the process
 * with no listener) and then the client reconnects on its own, so errors are only logged; the
 * logged error names the failure, never the URL.
 */
export function createRedisClient(url: string, logger: Pick<Logger, 'warn'>) {
  const redis = createClient({ url, socket: { connectTimeout: 2000 } });
  redis.on('error', (error: unknown) => logger.warn({ err: error }, 'redis connection error'));
  return redis;
}
