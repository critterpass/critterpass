import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { z } from 'zod';

import { summarize, timeSequential, type LatencySummary } from '../s-db/stats';
import { formatError } from '../shared/format-error';

import { connectAndWaitForSync, createSpikeSyncClient } from './client';
import {
  addSpikeTableToPublication,
  assertNoSpikeTableInPublication,
  dropSpikeSchema,
  ensureSpikeSchema,
  removeSpikeTableFromPublication,
} from './schema';
import { testChatLatency, testOfflineReplay, testReplicationAndReject, type ScenarioContext } from './scenario';

/**
 * Runs the S-SYNC scenario against an already-deployed target (Railway `spike-sync-app` +
 * `spike-powersync-repl`/`spike-powersync-api`, replicating from a PlanetScale branch) instead
 * of the local Docker stack `run.ts` uses. This is what records the pass-criteria numbers in
 * the ADR: real Railway SG ↔ PlanetScale network distance for chat latency and offline replay,
 * plus a connection ramp against the real `powersync-api` service. Owns the spike schema's
 * lifecycle on the target database (add to the shared `powersync` publication before, remove
 * after) since the deployed app service deliberately does not (main.ts).
 */
const envSchema = z.object({
  S_SYNC_APP_URL: z.url(),
  S_SYNC_SYNC_ENDPOINT: z.url(),
  /** The schema-owning role (`app_owner`'s `DATABASE_DIRECT_URL`, same as real migrations use — see schema.ts). */
  S_SYNC_DATABASE_URL: z.url(),
  S_SYNC_CHAT_SAMPLES: z.coerce.number().int().positive().default(50),
  S_SYNC_OFFLINE_OPS: z.coerce.number().int().positive().default(50),
});

function parseConnsArg(argv: readonly string[]): number {
  const index = argv.indexOf('--conns');
  if (index === -1) return 1000;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error('--conns must be a positive integer');
  return value;
}

interface ConnectionRampReport {
  targetConnections: number;
  connected: number;
  failures: number;
  connect: LatencySummary;
  firstSynced: number;
  memory: NodeJS.MemoryUsage;
  stoppedEarly: boolean;
  stopReason: string | null;
  heldOpenRoundTrip: LatencySummary;
}

/**
 * Ramps real `@powersync/node` clients (not raw sockets — each is a genuine local SQLite-backed
 * client speaking PowerSync's real sync protocol) up to `target`, in batches, against the
 * deployed `powersync-api`. A single read worker per client (`readWorkerCount: 1`) is the
 * lightest configuration this SDK supports; measured cost is still ~50 MB RSS per client (a
 * fresh worker-thread V8 isolate each), so this is bounded by this machine's shared RAM (16 GB,
 * split with sibling agents per the run's environment) well before it would be bounded by
 * `powersync-api`'s own capacity. `maxRssMb` stops the ramp early — rather than risking the host
 * — and the report says so explicitly instead of silently reporting a partial number as if it
 * were the target ("scale down and state it").
 */
async function rampConnections(
  ctx: Pick<ScenarioContext, 'appUrl' | 'syncEndpoint' | 'clientDir'>,
  target: number,
  batchSize: number,
  maxRssMb: number,
): Promise<ConnectionRampReport> {
  const clients: Awaited<ReturnType<typeof createSpikeSyncClient>>[] = [];
  const connectMs: number[] = [];
  let failures = 0;
  let firstSynced = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  for (let start = 0; start < target; start += batchSize) {
    const currentRssMb = process.memoryUsage().rss / 1024 / 1024;
    if (currentRssMb >= maxRssMb) {
      stoppedEarly = true;
      stopReason = `RSS ${Math.round(currentRssMb)} MB reached the ${maxRssMb} MB safety ceiling for this shared host before ${target} connections were attempted`;
      break;
    }

    const batchCount = Math.min(batchSize, target - start);
    const results = await Promise.all(
      Array.from({ length: batchCount }, async (_unused, i) => {
        const userId = `load-user-${start + i}`;
        const startedAt = performance.now();
        try {
          const db = await createSpikeSyncClient({
            dbFilename: `load-${start + i}.db`,
            dbLocation: ctx.clientDir,
          });
          // Waits for an actual successful sync, not just that `connect()` was called — a
          // permanently rejected connection (e.g. the server's `max_concurrent_connections` cap)
          // never rejects a bare `connect()`, it just retries forever in the background
          // (client.ts). This also disconnects (stopping that retry loop) on failure.
          await connectAndWaitForSync(db, { appUrl: ctx.appUrl, syncEndpoint: ctx.syncEndpoint, userId }, 15_000);
          const ms = performance.now() - startedAt;
          return { ok: true as const, db, ms };
        } catch (error) {
          return { ok: false as const, error };
        }
      }),
    );
    for (const result of results) {
      if (result.ok) {
        clients.push(result.db);
        connectMs.push(result.ms);
        firstSynced += 1;
      } else {
        failures += 1;
      }
    }
    console.error(
      JSON.stringify({
        msg: 's-sync load progress',
        connected: clients.length,
        failures,
        target,
        rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      }),
    );
  }

  // Proves connections stay responsive under load (a local SQLite read on a random held-open
  // client), not a real network round-trip contract — same caveat as S-RT's identical check.
  const heldOpenRoundTrip = await timeSequential(Math.min(50, clients.length), async () => {
    const target = clients[Math.floor(Math.random() * clients.length)];
    await target?.get('select 1').catch(() => undefined);
  });

  const report: ConnectionRampReport = {
    targetConnections: target,
    connected: clients.length,
    failures,
    connect: summarize(connectMs),
    firstSynced,
    memory: process.memoryUsage(),
    stoppedEarly,
    stopReason,
    heldOpenRoundTrip: summarize(heldOpenRoundTrip),
  };

  await Promise.all(clients.map((db) => db.disconnect().then(() => db.close())));
  return report;
}

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const targetConnections = parseConnsArg(process.argv.slice(2));
  const batchSize = Number(process.env['S_SYNC_LOAD_BATCH_SIZE'] ?? '25');
  // Measured ~50 MB RSS per client at readWorkerCount:1 (a fresh worker-thread V8 isolate each);
  // this machine runs several sibling agents sharing 16 GB total, so the ramp stops itself well
  // short of exhausting the host rather than trusting --conns alone.
  const maxRssMb = Number(process.env['S_SYNC_LOAD_MAX_RSS_MB'] ?? '3000');

  const pool = new pg.Pool({ connectionString: env.S_SYNC_DATABASE_URL, max: 5, connectionTimeoutMillis: 10_000 });
  const clientDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-spike-s-sync-load-'));

  // Normally this run owns the full lifecycle (assert clean → create/publish → measure →
  // unpublish/drop). Set when the spike's Railway services were already deployed against an
  // already-published schema in an earlier pass (so PowerSync's replication slot is already
  // primed) — cleanup at the end still runs either way.
  if (process.env['S_SYNC_SKIP_SETUP'] !== 'true') {
    await assertNoSpikeTableInPublication(pool);
    await ensureSpikeSchema(pool, process.env['S_SYNC_REPLICATION_ROLE_USERNAME']);
    await addSpikeTableToPublication(pool);
  }

  try {
    const ctx: ScenarioContext = {
      appUrl: env.S_SYNC_APP_URL,
      syncEndpoint: env.S_SYNC_SYNC_ENDPOINT,
      pool,
      clientDir,
    };

    console.error(JSON.stringify({ msg: 's-sync load progress', step: 'testReplicationAndReject' }));
    const replicationAndReject = await testReplicationAndReject(ctx);

    console.error(JSON.stringify({ msg: 's-sync load progress', step: 'testChatLatency' }));
    const chatLatency = await testChatLatency(ctx, env.S_SYNC_CHAT_SAMPLES);

    console.error(JSON.stringify({ msg: 's-sync load progress', step: 'testOfflineReplay' }));
    const offlineReplay = await testOfflineReplay(ctx, env.S_SYNC_OFFLINE_OPS);

    console.error(JSON.stringify({ msg: 's-sync load progress', step: 'rampConnections', targetConnections }));
    const connections = await rampConnections(ctx, targetConnections, batchSize, maxRssMb);

    console.log(
      JSON.stringify({
        msg: 's-sync load report',
        report: {
          target: 'railway-planetscale',
          replicationAndReject,
          chatLatency,
          offlineReplay,
          connections,
        },
      }),
    );
  } finally {
    // Skip when a separate connection-ramp pass (load-gen.ts, run from a Railway one-off rather
    // than this shared dev machine) still needs the schema published and the replication slot
    // primed after this process exits — that pass's own operator does the final cleanup instead.
    if (process.env['S_SYNC_SKIP_CLEANUP'] !== 'true') {
      await removeSpikeTableFromPublication(pool);
      await dropSpikeSchema(pool);
      await assertNoSpikeTableInPublication(pool);
    }
    await pool.end();
    await fs.rm(clientDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-sync load failed', error: formatError(error) }));
  process.exitCode = 1;
});
