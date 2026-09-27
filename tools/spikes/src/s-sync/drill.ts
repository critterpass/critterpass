import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import pg from 'pg';
import { z } from 'zod';

import { formatError } from '../shared/format-error';

import { connectSpikeSyncClient, createSpikeSyncClient } from './client';
import {
  addSpikeTableToPublication,
  assertNoSpikeTableInPublication,
  dropSpikeSchema,
  ensureSpikeSchema,
  removeSpikeTableFromPublication,
} from './schema';

const execFileAsync = promisify(execFile);

/**
 * PlanetScale switchover drill (system-architecture.md §10 "failover/switchover drill in S-SYNC
 * and quarterly (slot survives)", §11 S-SYNC "PlanetScale switchover keeps the logical slot").
 * Assumes `spike-sync-app` + `spike-powersync-repl`/`spike-powersync-api` are already deployed
 * and replicating from the target PlanetScale branch (deployment is a manual, documented step —
 * see the ADR's rerun section, same pattern as T1/S-DB's Railway one-off). This script owns only
 * the measurement: a continuous writer, a live watcher, triggering the real
 * `pscale branch switchover`, and the before/after replication-slot check.
 */
const envSchema = z.object({
  S_SYNC_APP_URL: z.url(),
  S_SYNC_SYNC_ENDPOINT: z.url(),
  /** The schema-owning role (`app_owner`'s `DATABASE_DIRECT_URL`, same as real migrations use — see schema.ts). */
  S_SYNC_DATABASE_URL: z.url(),
  S_SYNC_DRILL_DATABASE: z.string().default('critterpass'),
  S_SYNC_DRILL_BRANCH: z.string().default('main'),
  S_SYNC_DRILL_ORG: z.string().default('critterpass'),
  S_SYNC_WRITE_INTERVAL_MS: z.coerce.number().int().positive().default(500),
  S_SYNC_BASELINE_MS: z.coerce.number().int().positive().default(20_000),
  S_SYNC_POST_SWITCHOVER_MS: z.coerce.number().int().positive().default(60_000),
});

interface WriteRecord {
  id: string;
  postedAt: number;
  ackedAt: number | null;
  failed: boolean;
  error?: string;
}

async function postDrillMessage(appUrl: string, id: string, body: string): Promise<void> {
  const response = await fetch(`${appUrl}/sync/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ops: [{ id, table: 'messages', op: 'PUT', data: { body, created_by: 'drill-writer' } }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

async function querySlots(pool: pg.Pool): Promise<Array<{ slot_name: string; active: boolean }>> {
  const result = await pool.query<{ slot_name: string; active: boolean }>(
    `select slot_name, active from pg_replication_slots where slot_name like 'spike_sync_%'`,
  );
  return result.rows;
}

async function main(): Promise<void> {
  const env = envSchema.parse(process.env);
  const pool = new pg.Pool({ connectionString: env.S_SYNC_DATABASE_URL, max: 3, connectionTimeoutMillis: 10_000 });
  pool.on('error', (error) =>
    console.error(JSON.stringify({ msg: 's-sync drill pool error', error: String(error) })),
  );

  // See load.ts's identical escape hatch: set when the spike's Railway services were already
  // deployed against an already-published schema (PowerSync's replication slot already primed).
  if (process.env['S_SYNC_SKIP_SETUP'] !== 'true') {
    await assertNoSpikeTableInPublication(pool);
    await ensureSpikeSchema(pool, process.env['S_SYNC_REPLICATION_ROLE_USERNAME']);
    await addSpikeTableToPublication(pool);
  }

  const clientDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cp-spike-s-sync-drill-'));
  const watcher = await createSpikeSyncClient({ dbFilename: 'drill-watcher.db', dbLocation: clientDir });
  const writes: WriteRecord[] = [];
  const arrivals = new Map<string, number>();
  let stopWriter = false;

  function progress(step: string, extra: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ msg: 's-sync drill progress', step, at: new Date().toISOString(), ...extra }));
  }

  try {
    progress('connecting watcher');
    await connectSpikeSyncClient(watcher, {
      appUrl: env.S_SYNC_APP_URL,
      syncEndpoint: env.S_SYNC_SYNC_ENDPOINT,
      userId: 'drill-watcher',
    });
    await watcher.waitForFirstSync();

    void (async () => {
      for await (const result of watcher.watch('SELECT id FROM messages')) {
        const now = Date.now();
        for (const row of (result.rows?._array ?? []) as Array<{ id: string }>) {
          if (!arrivals.has(row.id)) arrivals.set(row.id, now);
        }
      }
    })().catch(() => undefined);

    const writerLoop = (async () => {
      let i = 0;
      while (!stopWriter) {
        const id = crypto.randomUUID();
        const record: WriteRecord = { id, postedAt: Date.now(), ackedAt: null, failed: false };
        writes.push(record);
        try {
          await postDrillMessage(env.S_SYNC_APP_URL, id, `drill message ${i}`);
          record.ackedAt = Date.now();
        } catch (error) {
          record.failed = true;
          record.error = formatError(error);
        }
        i += 1;
        await new Promise((resolve) => setTimeout(resolve, env.S_SYNC_WRITE_INTERVAL_MS));
      }
    })();

    progress('baseline period', { ms: env.S_SYNC_BASELINE_MS });
    await new Promise((resolve) => setTimeout(resolve, env.S_SYNC_BASELINE_MS));

    const slotsBefore = await querySlots(pool);
    progress('slots before switchover', { slotsBefore });

    progress('triggering pscale branch switchover');
    const switchoverStartedAt = Date.now();
    const { stdout } = await execFileAsync('pscale', [
      'branch',
      'switchover',
      env.S_SYNC_DRILL_DATABASE,
      env.S_SYNC_DRILL_BRANCH,
      '--org',
      env.S_SYNC_DRILL_ORG,
      '--format',
      'json',
    ]);
    const switchoverFinishedAt = Date.now();
    let switchoverResult: unknown = stdout.trim();
    try {
      switchoverResult = JSON.parse(stdout);
    } catch {
      // keep the raw string — some CLI paths do not emit pure JSON on stdout
    }
    progress('switchover command returned', { commandMs: switchoverFinishedAt - switchoverStartedAt });

    progress('post-switchover observation period', { ms: env.S_SYNC_POST_SWITCHOVER_MS });
    await new Promise((resolve) => setTimeout(resolve, env.S_SYNC_POST_SWITCHOVER_MS));

    stopWriter = true;
    await writerLoop;

    // pool queries right after a primary switch can hit one stale connection; one retry covers it.
    const slotsAfter = await querySlots(pool).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return querySlots(pool);
    });
    progress('slots after switchover', { slotsAfter });

    const lastGoodBefore = [...writes].reverse().find((w) => !w.failed && w.postedAt < switchoverStartedAt);
    const firstGoodAfter = writes.find((w) => !w.failed && w.postedAt >= switchoverStartedAt);
    const writeGapMs =
      lastGoodBefore?.ackedAt != null && firstGoodAfter?.ackedAt != null
        ? firstGoodAfter.ackedAt - lastGoodBefore.ackedAt
        : null;

    let replicationResumeMs: number | null = null;
    for (const w of writes) {
      if (w.failed || w.postedAt < switchoverStartedAt) continue;
      const arrivedAt = arrivals.get(w.id);
      if (arrivedAt) {
        replicationResumeMs = arrivedAt - switchoverStartedAt;
        break;
      }
    }

    const failedDuringSwitchover = writes.filter((w) => w.failed).length;

    const report = {
      database: env.S_SYNC_DRILL_DATABASE,
      branch: env.S_SYNC_DRILL_BRANCH,
      switchoverResult,
      switchoverCommandMs: switchoverFinishedAt - switchoverStartedAt,
      totalWrites: writes.length,
      failedWrites: failedDuringSwitchover,
      writeGapMs,
      replicationResumeMs,
      slotsBefore,
      slotsAfter,
      slotNameStable:
        slotsBefore.length > 0 &&
        slotsAfter.length > 0 &&
        slotsBefore[0]?.slot_name === slotsAfter[0]?.slot_name,
    };
    console.log(JSON.stringify({ msg: 's-sync drill report', report }));
  } finally {
    stopWriter = true;
    progress('cleaning up');
    await watcher.disconnect().catch(() => undefined);
    await watcher.close().catch(() => undefined);
    await removeSpikeTableFromPublication(pool).catch((error: unknown) =>
      console.error(JSON.stringify({ msg: 's-sync drill: publication cleanup failed', error: formatError(error) })),
    );
    await dropSpikeSchema(pool).catch((error: unknown) =>
      console.error(JSON.stringify({ msg: 's-sync drill: schema cleanup failed', error: formatError(error) })),
    );
    await assertNoSpikeTableInPublication(pool).catch((error: unknown) =>
      console.error(JSON.stringify({ msg: 's-sync drill: publication not empty after cleanup', error: formatError(error) })),
    );
    await pool.end();
    await fs.rm(clientDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ msg: 's-sync drill failed', error: formatError(error) }));
  process.exitCode = 1;
});
