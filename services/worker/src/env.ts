import { z } from 'zod';

/** Env files write unset optional values as `KEY=`; treat the empty string as absent. */
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional());

/** Runtime configuration for the worker service, validated once at boot. */
export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8788),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Direct connection (port 5432): LISTEN/NOTIFY and job locking do not work through PgBouncer. */
  DATABASE_DIRECT_URL: z.url(),
  REDIS_URL: z.url(),
  SENTRY_DSN: optionalUrl,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  COMMIT_SHA: z.string().min(1).default('dev'),
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
