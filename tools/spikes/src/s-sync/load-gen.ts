import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { formatError } from '../shared/format-error';

import { connectAndWaitForSync, createSpikeSyncClient } from './client';

/**
 * One-shot Railway job (`tools/spikes/s-sync-loadgen.Dockerfile`) that ramps real
 * `@powersync/node` clients against the deployed `spike-powersync-api`, same mechanics as
 * `load.ts`'s `rampConnections` but run from Railway's own container instead of the dev
 * machine load.ts otherwise runs on — that machine measured ~50 MB RSS per client and shares
 * 16 GB with sibling agents (see the ADR), which caps a useful connection count far below the
 * 1k target well before `powersync-api` itself would be the bottleneck. Deleted once the number
 * is recorded (phase-02 rule: delete every staging-only spike service after measuring).
 */
const envSchema = z.object({
  SYNC_ENDPOINT: z.url(),
  APP_URL: z.url(),
  TARGET_CONNECTIONS: z.coerce.number().int().positive().default(1000),
  BATCH_SIZE: z.coerce.number().int().positive().default(50),
  MAX_RSS_MB: z.coerce.number().int().positive().default(6000),
});

function percentile(samplesMs: readonly number[], p: number): number {
  if (samplesMs.length === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)] ?? 0;
}

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const clientDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-spike-s-sync-loadgen-'));
  const connectMs: number[] = [];
  let connected = 0;
  let failures = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  for (let start = 0; start < env.TARGET_CONNECTIONS; start += env.BATCH_SIZE) {
    const rssMb = process.memoryUsage().rss / 1024 / 1024;
    if (rssMb >= env.MAX_RSS_MB) {
      stoppedEarly = true;
      stopReason = `RSS ${Math.round(rssMb)} MB reached the ${env.MAX_RSS_MB} MB ceiling before ${env.TARGET_CONNECTIONS} connections were attempted`;
      break;
    }
    const batchCount = Math.min(env.BATCH_SIZE, env.TARGET_CONNECTIONS - start);
    const results = await Promise.all(
      Array.from({ length: batchCount }, async (_unused, i) => {
        const startedAt = performance.now();
        try {
          const db = await createSpikeSyncClient({
            dbFilename: `loadgen-${start + i}.db`,
            dbLocation: clientDir,
          });
          await connectAndWaitForSync(
            db,
            { appUrl: env.APP_URL, syncEndpoint: env.SYNC_ENDPOINT, userId: `loadgen-user-${start + i}` },
            15_000,
          );
          return { ok: true as const, ms: performance.now() - startedAt };
        } catch (error) {
          return { ok: false as const, error };
        }
      }),
    );
    for (const result of results) {
      if (result.ok) {
        connected += 1;
        connectMs.push(result.ms);
      } else {
        failures += 1;
      }
    }
    console.log(
      JSON.stringify({
        msg: 's-sync loadgen progress',
        connected,
        failures,
        target: env.TARGET_CONNECTIONS,
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      }),
    );
  }

  console.log(
    JSON.stringify({
      msg: 's-sync loadgen report',
      report: {
        targetConnections: env.TARGET_CONNECTIONS,
        connected,
        failures,
        stoppedEarly,
        stopReason,
        connect: {
          count: connectMs.length,
          p50Ms: percentile(connectMs, 50),
          p95Ms: percentile(connectMs, 95),
          p99Ms: percentile(connectMs, 99),
          maxMs: connectMs.length ? Math.max(...connectMs) : 0,
        },
        memory: process.memoryUsage(),
      },
    }),
  );
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-sync loadgen failed', error: formatError(error) }));
  process.exitCode = 1;
});
