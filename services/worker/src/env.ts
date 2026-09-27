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
  /** Direct connection (port 5432): LISTEN/NOTIFY and job locking do not work through PgBouncer. */
  DATABASE_DIRECT_URL: z.url(),
  REDIS_URL: z.url(),
  SENTRY_DSN: optionalUrl,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  COMMIT_SHA: z.preprocess(emptyAsUndefined, z.string().min(1).default('dev')),
  /** Foursquare Places API key for live open/closed checks (src/places/live-check.ts); omitted =
   *  live checks never run (no Foursquare Places API account configured). */
  FOURSQUARE_API_KEY: optionalString,
  /** Overrides the Overture release path in src/places/ingest.ts. */
  OVERTURE_RELEASE: optionalString,
  /** A parquet export standing in for FSQ OS Places' gated Iceberg catalog; unset = Overture-only ingest. */
  FSQ_OS_PLACES_PARQUET_URI: optionalString,
  /** Centrifugo HTTP server API base (private network, e.g. `http://centrifugo.railway.internal:8000`);
   *  with CENTRIFUGO_HTTP_API_KEY enables the rt_outbox relay (src/rt-relay). Unset = no relay runs
   *  and realtime hints stay queued in rt_outbox. */
  CENTRIFUGO_API_URL: optionalUrl,
  /** Same value as the Centrifugo service's CENTRIFUGO_HTTP_API_KEY. */
  CENTRIFUGO_HTTP_API_KEY: optionalString,
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
