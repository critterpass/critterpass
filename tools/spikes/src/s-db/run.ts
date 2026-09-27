import pg from 'pg';
import { z } from 'zod';

import { formatError } from '../shared/format-error';

import { runProbe } from './probe';

const envSchema = z.object({
  DATABASE_URL_POOLED: z.url(),
  DATABASE_URL_DIRECT: z.url(),
  TARGET_LABEL: z.string().min(1).default('unknown'),
  S_DB_LATENCY_ITERATIONS: z.coerce.number().int().positive().default(1000),
  S_DB_HNSW_ROWS: z.coerce.number().int().positive().default(100_000),
  S_DB_HNSW_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  S_DB_HNSW_QUERY_ITERATIONS: z.coerce.number().int().positive().default(200),
  // The HNSW build alone can run far longer than every other measurement combined; set to
  // "true" for a fast rerun of everything else while a separate run covers HNSW.
  S_DB_SKIP_HNSW: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
});

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`s-db run: invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pooled = new pg.Pool({
    connectionString: env.DATABASE_URL_POOLED,
    max: 5,
    connectionTimeoutMillis: 10_000,
  });
  const direct = new pg.Pool({
    connectionString: env.DATABASE_URL_DIRECT,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
  pooled.on('error', (error) =>
    console.error(JSON.stringify({ msg: 'pooled pool error', error: String(error) })),
  );
  direct.on('error', (error) =>
    console.error(JSON.stringify({ msg: 'direct pool error', error: String(error) })),
  );

  try {
    const report = await runProbe(
      { pooled, direct },
      {
        target: env.TARGET_LABEL,
        latencyIterations: env.S_DB_LATENCY_ITERATIONS,
        hnswRows: env.S_DB_HNSW_ROWS,
        hnswBatchSize: env.S_DB_HNSW_BATCH_SIZE,
        hnswQueryIterations: env.S_DB_HNSW_QUERY_ITERATIONS,
        skipHnsw: env.S_DB_SKIP_HNSW,
      },
      (step) =>
        console.error(JSON.stringify({ msg: 's-db progress', step, at: new Date().toISOString() })),
    );
    // Single-line JSON so `railway logs` and a local redirect both capture one greppable record.
    console.log(JSON.stringify({ msg: 's-db report', report }));
  } finally {
    await Promise.allSettled([pooled.end(), direct.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-db probe failed', error: formatError(error) }));
  process.exitCode = 1;
});
