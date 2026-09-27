import { z } from 'zod';

import { formatError } from '../shared/format-error';

import { runBench } from './bench';
import { evaluateMatrixBudget, evaluateRouteBudget } from './budgets';
import { citiesInGroups, createRng } from './cities';
import { createValhallaClient } from './client';

const envSchema = z.object({
  VALHALLA_BASE_URL: z.url(),
  VALHALLA_TARGET_LABEL: z.string().min(1).default('unknown'),
  // Comma-separated city groups: "sea-japan", "guide", or "sea-japan,guide" for every city.
  VALHALLA_CITY_GROUPS: z.string().min(1).default('sea-japan,guide'),
  VALHALLA_PAIRS_PER_CITY: z.coerce.number().int().positive().default(65),
  VALHALLA_MATRIX_CALLS_PER_CITY: z.coerce.number().int().positive().default(10),
  VALHALLA_MATRIX_SIZE: z.coerce.number().int().positive().default(16),
  VALHALLA_SEED: z.coerce.number().int().default(20_260_927),
  VALHALLA_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`valhalla run: invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const cities = citiesInGroups(env.VALHALLA_CITY_GROUPS.split(',').map((group) => group.trim()));
  if (cities.length === 0) {
    throw new Error(
      `valhalla run: VALHALLA_CITY_GROUPS matched no cities: ${env.VALHALLA_CITY_GROUPS}`,
    );
  }

  const client = createValhallaClient({
    baseUrl: env.VALHALLA_BASE_URL,
    timeoutMs: env.VALHALLA_TIMEOUT_MS,
  });
  const ready = await client.status();
  if (!ready) {
    throw new Error(
      `valhalla run: ${env.VALHALLA_BASE_URL}/status did not return ok before the bench started`,
    );
  }

  const report = await runBench(
    {
      client,
      cities,
      pairsPerCityPerMode: env.VALHALLA_PAIRS_PER_CITY,
      matrixCallsPerCityPerMode: env.VALHALLA_MATRIX_CALLS_PER_CITY,
      matrixSize: env.VALHALLA_MATRIX_SIZE,
      seed: env.VALHALLA_SEED,
      onProgress: (step) =>
        console.error(
          JSON.stringify({ msg: 'valhalla bench progress', step, at: new Date().toISOString() }),
        ),
    },
    createRng(env.VALHALLA_SEED),
  );

  const verdict = {
    walk: evaluateRouteBudget('walk route p95 (overall)', report.overallWalk.p95Ms),
    drive: evaluateRouteBudget('drive route p95 (overall)', report.overallDrive.p95Ms),
    matrixWalk: evaluateMatrixBudget(
      '16x16 walk matrix p95 (overall)',
      report.overallMatrixWalk.p95Ms,
    ),
    matrixDrive: evaluateMatrixBudget(
      '16x16 drive matrix p95 (overall)',
      report.overallMatrixDrive.p95Ms,
    ),
  };

  // Single-line JSON so `railway logs` and a local redirect both capture one greppable record.
  console.log(
    JSON.stringify({
      msg: 'valhalla report',
      target: env.VALHALLA_TARGET_LABEL,
      cityGroups: env.VALHALLA_CITY_GROUPS,
      pairsPerCityPerMode: env.VALHALLA_PAIRS_PER_CITY,
      matrixCallsPerCityPerMode: env.VALHALLA_MATRIX_CALLS_PER_CITY,
      matrixSize: env.VALHALLA_MATRIX_SIZE,
      report,
      verdict,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 'valhalla run failed', error: formatError(error) }));
  process.exitCode = 1;
});
