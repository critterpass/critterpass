/**
 * The api's process-level observability, started once at boot: the redacting pino logger and
 * Sentry. OpenTelemetry starts earlier, from the `--import` preload (./instrument.ts).
 */
import type { ApiEnv } from '../env';
import { createLogger } from './logger';
import { initSentry } from './sentry';

export function startApiObservability(env: ApiEnv, version: string) {
  return {
    logger: createLogger({ level: env.LOG_LEVEL, service: 'api', commit: env.COMMIT_SHA }),
    errors: initSentry({
      dsn: env.SENTRY_DSN,
      environment: env.APP_ENV,
      release: `api@${version}+${env.COMMIT_SHA}`,
    }),
  };
}
