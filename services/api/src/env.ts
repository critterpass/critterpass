import { z } from 'zod';

/** Env files (and unresolved platform references) write unset values as `KEY=`; treat `''` as absent. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalUrl = z.preprocess(emptyAsUndefined, z.url().optional());
const optionalString = z.preprocess(emptyAsUndefined, z.string().min(1).optional());

/** Runtime configuration for the api service, validated once at boot. */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Deployment tier; NODE_ENV stays `production` in staging, so tier-specific behaviour keys off this. */
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Pooled connection (PgBouncer, port 6432) used by request transactions. */
  DATABASE_URL: z.url(),
  /** Direct connection (port 5432), read only by the pre-deploy migration step. */
  DATABASE_DIRECT_URL: optionalUrl,
  REDIS_URL: z.url(),
  PUBLIC_BASE_URL: z.url(),
  SENTRY_DSN: optionalUrl,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  COMMIT_SHA: z.preprocess(emptyAsUndefined, z.string().min(1).default('dev')),
  /** Mapbox Geocoding v6 server key (src/geocoding/mapbox.ts); omitted = forward geocoding stays
   *  local-only (our pois + cities), no Mapbox fallback for addresses. */
  MAPBOX_TOKEN: optionalString,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Parses the environment, failing fast with every problem listed (values are never echoed). */
export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid api environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}
