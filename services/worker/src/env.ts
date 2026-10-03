import { poolMaxEnv } from '@cp/db';
import { z } from 'zod';

/** Env files (and unresolved platform references) write unset values as `KEY=`; treat `''` as absent. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalUrl = z.preprocess(emptyAsUndefined, z.url().optional());
const optionalString = z.preprocess(emptyAsUndefined, z.string().min(1).optional());

/** Runtime configuration for the worker service, validated once at boot. */
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Deployment tier; NODE_ENV stays `production` in staging, so tier-specific behaviour keys off this. */
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(8788),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Direct connection (port 5432) for pg-boss and the LISTEN clients: PgBouncer's transaction
   *  pooling drops LISTEN and rejects the `-c role=` startup option pg-boss connects with. */
  DATABASE_DIRECT_URL: z.url(),
  /** Pooled connection (PgBouncer, port 6432) for job handlers' transactions; unset = they share
   *  the direct connection (local development). */
  DATABASE_URL: optionalUrl,
  /** Job handlers' pool size (through PgBouncer when DATABASE_URL is set). */
  DB_POOL_MAX: poolMaxEnv(5),
  /** pg-boss's own pool (fetch, settle, maintenance) on the direct connection; its LISTEN client
   *  and the realtime relay's listener are one direct connection each on top. */
  JOBS_POOL_MAX: poolMaxEnv(2),
  REDIS_URL: z.url(),
  SENTRY_DSN: optionalUrl,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  /** PostHog EU project key; unset = the domain-event analytics export does not run. */
  POSTHOG_PROJECT_API_KEY: optionalString,
  POSTHOG_HOST: optionalUrl,
  /** HMAC key for the pseudonymous analytics `user_pid` (shared with the api). */
  ANALYTICS_PID_SALT: z.preprocess(emptyAsUndefined, z.string().min(16).optional()),
  COMMIT_SHA: z.preprocess(emptyAsUndefined, z.string().min(1).default('dev')),
  /** Foursquare Places API key for the curated id match (`places.fsq_match`,
   *  src/places/foursquare-match.ts); unset = the job is not registered. */
  FOURSQUARE_API_KEY: optionalString,
  /** Foursquare calls per UTC month across the api and the worker; same value on both services. */
  FOURSQUARE_MONTHLY_CALL_CAP: z.coerce.number().int().positive().default(4000),
  /** Travelpayouts Data API token for the nightly `fares.refresh` (src/travel-data); unset = the
   *  job is not registered and every fare reads as "no recent price". */
  TRAVELPAYOUTS_TOKEN: optionalString,
  /** WeatherAPI.com key for `weather.refresh` (src/travel-data); unset = the job is not registered
   *  and weather surfaces show their empty state. */
  WEATHERAPI_KEY: optionalString,
  /** Forecast days the WeatherAPI.com plan allows (free 3, Starter 7, Pro+ 14). */
  WEATHERAPI_FORECAST_DAYS: z.coerce.number().int().min(1).max(14).default(3),
  /** Marine forecast days the plan allows (free 1, Starter 3, Pro+ 5). */
  WEATHERAPI_MARINE_DAYS: z.coerce.number().int().min(1).max(7).default(1),
  /** Overrides the Overture release path in src/places/ingest.ts. */
  OVERTURE_RELEASE: optionalString,
  /** A parquet export standing in for FSQ OS Places' gated Iceberg catalog; unset = Overture-only ingest. */
  FSQ_OS_PLACES_PARQUET_URI: optionalString,
  /** Centrifugo HTTP server API base (private network, e.g. `http://centrifugo.railway.internal:9000`);
   *  with CENTRIFUGO_HTTP_API_KEY enables the rt_outbox relay (src/rt-relay). Unset = no relay runs
   *  and realtime hints stay queued in rt_outbox. */
  CENTRIFUGO_API_URL: optionalUrl,
  /** Same value as the Centrifugo service's CENTRIFUGO_HTTP_API_KEY. */
  CENTRIFUGO_HTTP_API_KEY: optionalString,
  /** Valhalla base URL for crew live map ETAs (`sources_to_targets`); unset = straight-line
   *  estimates labelled "about". */
  VALHALLA_URL: optionalUrl,
  /** The web origin `og.render` asks for share cards (e.g. `https://critterpass.app`); unset = the
   *  primary link host of APP_ENV, and no card requests locally. */
  WEB_BASE_URL: optionalUrl,
  /** The DeepSeek key: generation runs through DeepSeek's Anthropic-format API
   *  (packages/ai/src/env.ts); unset = decision fallbacks and AI job steps have no model. */
  ANTHROPIC_API_KEY: optionalString,
  /** Override of that endpoint; unset = https://api.deepseek.com/anthropic. */
  ANTHROPIC_BASE_URL: optionalUrl,
  /** Tavily search key for `season.research` (src/travel-data/season-research.ts); unset (or no
   *  ANTHROPIC_API_KEY) = the monthly season events research does not run. */
  TAVILY_API_KEY: optionalString,
  /** TypeSafe Jev key for typed decisions (`compliance.check`, src/ai/compliance-job.ts); unset =
   *  decisions answer from the fast-tier twin. */
  TYPESAFE_API_KEY: optionalString,
  /** Langfuse traces for model calls (packages/ai/src/telemetry/langfuse.ts); both keys unset =
   *  no traces are exported. */
  LANGFUSE_PUBLIC_KEY: optionalString,
  LANGFUSE_SECRET_KEY: optionalString,
  LANGFUSE_HOST: optionalUrl,
  /** Nightly `ops.backup` (src/jobs/ops/backup.ts): a role that can read every schema with
   *  BYPASSRLS. Staging and production need it and the BACKUP_S3_* set; without them the job fails
   *  and dead-letters instead of skipping. Local development runs no backup unless they are set. */
  BACKUP_DATABASE_URL: optionalUrl,
  /** S3 API endpoint of the off-provider bucket (R2: `https://<account>.r2.cloudflarestorage.com`). */
  BACKUP_S3_ENDPOINT: optionalUrl,
  BACKUP_S3_BUCKET: optionalString,
  BACKUP_S3_ACCESS_KEY_ID: optionalString,
  BACKUP_S3_SECRET_ACCESS_KEY: optionalString,
  /** R2 signs with region `auto`. */
  BACKUP_S3_REGION: z.preprocess(emptyAsUndefined, z.string().min(1).default('auto')),
  /** pg_dump binary (must be the server's major version or newer). */
  BACKUP_PG_DUMP_PATH: z.preprocess(emptyAsUndefined, z.string().min(1).default('pg_dump')),
  /** The media bucket (same values as the api's): avatar moderation reads uploads from it and
   *  writes rendered variants to it. All four unset = photo avatars wait for ops review. */
  R2_S3_ENDPOINT: optionalUrl,
  R2_BUCKET: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  /** PhotoDNA Cloud Service key: known-image hash matching for photo avatars once ops switches
   *  `moderation.hash_match` on; unset = photos wait for ops review. */
  PHOTODNA_API_KEY: optionalString,
  /** APNs token auth (src/push/apns.ts): key id, team id and the .p8 contents. All three or none. */
  APNS_KEY_ID: optionalString,
  APNS_TEAM_ID: optionalString,
  /** PEM text; a single-line value with literal `\n` escapes is accepted too. */
  APNS_PRIVATE_KEY_PEM: optionalString,
  /** Firebase service account JSON for FCM HTTP v1 (src/push/fcm.ts); unset = no Android pushes. */
  FCM_SERVICE_ACCOUNT_JSON: optionalString,
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Parses the environment, failing fast with every problem listed (values are never echoed). */
export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  const parsed = workerEnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid worker environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}
