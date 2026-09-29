/** Shared helpers for tests that queue envelopes and drive the upload queue. */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { generateUuidV7 } from '@cp/domain';

import { insertQueuedCommand } from '../queue-store';
import type { SyncTransport } from '../transport';
import { createUploadQueue, type BackoffPolicy, type UploadQueue } from '../upload-queue';

/** Deterministic, fast backoff: 20 ms doubling to 400 ms, always the full delay. */
export const TEST_BACKOFF: BackoffPolicy = { baseMs: 20, maxMs: 400, random: () => 1 };

/**
 * A backoff that parks every retry for an hour, so a test can read the state a failure left
 * behind before the retry starts, then run the retry itself with `retryNow()`. With a delay of
 * tens of ms the timer can fire between `flush()` and the next read on a loaded runner.
 */
export const HELD_BACKOFF: BackoffPolicy = { baseMs: 3_600_000, maxMs: 3_600_000, random: () => 1 };

export function testEnvelope(uid: string, cmd: string, payload: unknown) {
  return {
    op_id: generateUuidV7(),
    cmd,
    v: 1,
    actor: { uid, via: 'offline' },
    device: { id: 'device-test', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Ho_Chi_Minh' },
    client_ts: new Date().toISOString(),
    payload,
  };
}

/** Queues one envelope the way the command client does, returning its op_id. */
export async function enqueue(
  db: AbstractPowerSyncDatabase,
  uid: string,
  cmd: string,
  payload: unknown,
): Promise<string> {
  const envelope = testEnvelope(uid, cmd, payload);
  await db.writeTransaction((tx) =>
    insertQueuedCommand(tx, {
      opId: envelope.op_id,
      cmd,
      envelope,
      summary: null,
      createdAt: envelope.client_ts,
    }),
  );
  return envelope.op_id;
}

const openQueues = new Set<UploadQueue>();

export function queueWith(
  db: AbstractPowerSyncDatabase,
  transport: SyncTransport,
  onSessionRevoked: () => Promise<void> = () => Promise.resolve(),
  backoff: BackoffPolicy = TEST_BACKOFF,
): UploadQueue {
  const queue = createUploadQueue({ db, transport, onSessionRevoked, backoff });
  openQueues.add(queue);
  return queue;
}

/** Teardown: stops every queue `queueWith` made (timers and in-flight work) before its database closes. */
export async function stopQueues(): Promise<void> {
  const queues = [...openQueues];
  openQueues.clear();
  await Promise.all(queues.map((queue) => queue.stop()));
}

export async function commandRows(db: AbstractPowerSyncDatabase) {
  return db.getAll<{ id: string; status: string; attempts: number }>(
    'SELECT id, status, attempts FROM commands ORDER BY seq',
  );
}

/** Polls `check` until it returns true (real timers; the queue's backoff is tens of ms). */
export async function eventually(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
