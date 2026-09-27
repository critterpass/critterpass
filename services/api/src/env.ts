import { z } from 'zod';

/** Env files (and unresolved platform references) write unset values as `KEY=`; treat `''` as absent. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalUrl = z.preprocess(emptyAsUndefined, z.url().optional());

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
  /** Better Auth's own Postgres connection, authenticated as the `auth` role (docs/data-model.md §2): a narrower grant than the app's own pooled `app_owner`-derived connection. */
  AUTH_DATABASE_URL: z.url(),
  /** Encrypts JWKS private keys at rest and signs Better Auth's internal cookies; 32+ chars, generated with `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Comma-separated app scheme(s)/origins Better Auth accepts for OAuth redirects and the Expo plugin; mobile schemes always included regardless of this value. */
  APP_TRUSTED_ORIGINS: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
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
