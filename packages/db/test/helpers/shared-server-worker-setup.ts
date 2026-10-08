/**
 * Vitest `setupFiles` entry for suites that list the shared-server global set-ups: copies the
 * server details they provided into this worker's environment, where the container helpers look
 * for them before each test file runs.
 */
import { inject } from 'vitest';

import {
  SHARED_POSTGRES_ENV,
  SHARED_REDIS_ENV,
  type SharedPostgres,
  type SharedRedis,
} from './shared-server';

declare module 'vitest' {
  export interface ProvidedContext {
    cpSharedPostgres?: SharedPostgres;
    cpSharedRedis?: SharedRedis;
  }
}

const postgres = inject('cpSharedPostgres');
const redis = inject('cpSharedRedis');
if (postgres !== undefined) process.env[SHARED_POSTGRES_ENV] = JSON.stringify(postgres);
if (redis !== undefined) process.env[SHARED_REDIS_ENV] = JSON.stringify(redis);
