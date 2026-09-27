import crypto from 'node:crypto';

import type { PowerSyncDatabase } from '@powersync/node';
import type pg from 'pg';

import { summarize, type LatencySummary } from '../s-db/stats';

import { connectSpikeSyncClient, createSpikeSyncClient } from './client';
import { SPIKE_SCHEMA } from './schema';
import type { UploadResult } from './upload-app';

export interface ScenarioContext {
  appUrl: string;
  syncEndpoint: string;
  pool: pg.Pool;
  /** Directory for per-client SQLite files (a fresh temp dir per run — see run.ts/load.ts). */
  clientDir: string;
}

interface PostedMessage {
  id: string;
  body: string;
  createdBy: string;
}

async function postMessage(appUrl: string, message: PostedMessage): Promise<UploadResult> {
  const response = await fetch(`${appUrl}/sync/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ops: [
        {
          id: message.id,
          table: 'messages',
          op: 'PUT',
          data: { body: message.body, created_by: message.createdBy },
        },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`s-sync scenario: /sync/upload HTTP ${response.status}`);
  }
  const json = (await response.json()) as { results: UploadResult[] };
  const result = json.results[0];
  if (!result) throw new Error('s-sync scenario: /sync/upload returned no result for the op sent');
  return result;
}

interface ArrivalTracker {
  /** Resolves once `id` has been observed in this client's synced copy, or rejects on timeout. */
  waitFor(id: string, timeoutMs: number): Promise<void>;
  stop(): void;
}

/** Tracks message arrival via a live query — the same mechanism a real chat screen uses (code-standards.md §5 "PowerSync live queries"). */
function trackArrivals(db: PowerSyncDatabase): ArrivalTracker {
  const arrived = new Set<string>();
  const waiters = new Map<string, () => void>();
  let stopped = false;

  void (async () => {
    for await (const result of db.watch('SELECT id FROM messages')) {
      if (stopped) return;
      const rows = (result.rows?._array ?? []) as Array<{ id: string }>;
      for (const row of rows) {
        if (arrived.has(row.id)) continue;
        arrived.add(row.id);
        waiters.get(row.id)?.();
        waiters.delete(row.id);
      }
    }
  })().catch(() => undefined);

  return {
    waitFor(id, timeoutMs) {
      if (arrived.has(id)) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(id);
          reject(new Error(`s-sync: message ${id} did not arrive within ${timeoutMs}ms`));
        }, timeoutMs);
        waiters.set(id, () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
    stop() {
      stopped = true;
    },
  };
}

async function waitUntilQueueDrained(db: PowerSyncDatabase, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const batch = await db.getCrudBatch();
    if (batch == null) return;
    if (Date.now() > deadline) throw new Error('s-sync: upload queue did not drain in time');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export interface ReplicationAndRejectResult {
  replicatedWithinTimeout: boolean;
  acceptedStatus: UploadResult['status'];
  rejectHttpOk: true;
  rejectStatus: UploadResult['status'];
  rejectCode: string | null;
}

/** Proves basic replication (an accepted write reaches a fresh client) and the reject-with-2xx path (architecture §4.1). */
export async function testReplicationAndReject(
  ctx: ScenarioContext,
): Promise<ReplicationAndRejectResult> {
  const client = await createSpikeSyncClient({
    dbFilename: `replication-check-${crypto.randomUUID()}.db`,
    dbLocation: ctx.clientDir,
  });
  try {
    await connectSpikeSyncClient(client, {
      appUrl: ctx.appUrl,
      syncEndpoint: ctx.syncEndpoint,
      userId: 'replication-check',
    });
    await client.waitForFirstSync();

    const tracker = trackArrivals(client);
    const okId = crypto.randomUUID();
    const okResult = await postMessage(ctx.appUrl, {
      id: okId,
      body: 'hello from s-sync',
      createdBy: 'seed',
    });
    let replicatedWithinTimeout = true;
    try {
      await tracker.waitFor(okId, 15_000);
    } catch {
      replicatedWithinTimeout = false;
    }

    const rejectId = crypto.randomUUID();
    const rejectResult = await postMessage(ctx.appUrl, { id: rejectId, body: '', createdBy: 'seed' });
    const cmdResult = await ctx.pool.query<{ code: string }>(
      `select code from ${SPIKE_SCHEMA}.cmd_results where op_id = $1`,
      [rejectId],
    );
    tracker.stop();

    return {
      replicatedWithinTimeout,
      acceptedStatus: okResult.status,
      rejectHttpOk: true,
      rejectStatus: rejectResult.status,
      rejectCode: cmdResult.rows[0]?.code ?? null,
    };
  } finally {
    await client.disconnect();
    await client.close();
  }
}

/** Chat-row round-trip: sender posts directly, a second connected client's live query observes it (system-architecture.md §9). */
export async function testChatLatency(
  ctx: ScenarioContext,
  sampleCount: number,
): Promise<LatencySummary> {
  const receiver = await createSpikeSyncClient({
    dbFilename: `latency-receiver-${crypto.randomUUID()}.db`,
    dbLocation: ctx.clientDir,
  });
  try {
    await connectSpikeSyncClient(receiver, {
      appUrl: ctx.appUrl,
      syncEndpoint: ctx.syncEndpoint,
      userId: 'latency-receiver',
    });
    await receiver.waitForFirstSync();
    const tracker = trackArrivals(receiver);
    const samples: number[] = [];
    for (let i = 0; i < sampleCount; i += 1) {
      const id = crypto.randomUUID();
      const startedAt = performance.now();
      await postMessage(ctx.appUrl, { id, body: `chat message ${i}`, createdBy: 'sender' });
      await tracker.waitFor(id, 15_000);
      samples.push(performance.now() - startedAt);
    }
    tracker.stop();
    return summarize(samples);
  } finally {
    await receiver.disconnect();
    await receiver.close();
  }
}

export interface OfflineReplayResult {
  opsCount: number;
  queuedBeforeConnect: number | null;
  convergedCount: number;
  converged: boolean;
}

/** Offline outbox + reconciliation (system-architecture.md §7.c): N local inserts while disconnected, then reconnect and converge. */
export async function testOfflineReplay(
  ctx: ScenarioContext,
  opsCount: number,
): Promise<OfflineReplayResult> {
  const client = await createSpikeSyncClient({
    dbFilename: `offline-replay-${crypto.randomUUID()}.db`,
    dbLocation: ctx.clientDir,
  });
  const ids: string[] = [];
  try {
    // Offline: local inserts only, no connector attached yet — "queue persists across app restarts".
    for (let i = 0; i < opsCount; i += 1) {
      const id = crypto.randomUUID();
      ids.push(id);
      await client.execute(
        'insert into messages (id, body, created_by, created_at) values (?, ?, ?, ?)',
        [id, `offline message ${i}`, 'offline-client', new Date().toISOString()],
      );
    }

    let queuedBeforeConnect: number | null = null;
    try {
      const pending = await client.getCrudBatch();
      queuedBeforeConnect = pending?.crud.length ?? 0;
    } catch {
      queuedBeforeConnect = null; // diagnostic only — not load-bearing for the convergence assertion below
    }

    // Reconnect: the SDK flushes the queue via uploadData automatically.
    await connectSpikeSyncClient(client, {
      appUrl: ctx.appUrl,
      syncEndpoint: ctx.syncEndpoint,
      userId: 'offline-client',
    });
    await client.waitForFirstSync();
    await waitUntilQueueDrained(client, 30_000);
    // The queue draining only proves upload; give replication a moment to round-trip back down.
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const serverRows = await ctx.pool.query(`select id from ${SPIKE_SCHEMA}.messages where id = any($1)`, [
      ids,
    ]);
    return {
      opsCount,
      queuedBeforeConnect,
      convergedCount: serverRows.rowCount ?? 0,
      converged: (serverRows.rowCount ?? 0) === opsCount,
    };
  } finally {
    await client.disconnect();
    await client.close();
  }
}
