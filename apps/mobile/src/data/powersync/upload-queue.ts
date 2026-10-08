/**
 * Flushes the local `commands` queue to `POST /sync/upload` in insertion order
 * (docs/api-contracts.md §2.2, §5.2). Per batch: 2xx → every op has an outcome (applied/duplicate →
 * `done`, rejected → rolled back into `rejected_commands`) and the next batch follows at once; 503 →
 * the outcomes before `detail.first_unprocessed` are kept and the rest wait for a retry; no response
 * or any other failure → the whole batch waits. Retries back off exponentially with jitter, and a
 * newer op never overtakes an older one. `SESSION_REVOKED` stops everything and hands over to the
 * sign-out hooks, which wipe the database.
 *
 * A batch the server refuses for good (a 4xx whose error says `retryable: false`; a missing session
 * and a rate limit are not refusals) is never sent again on a timer: the same request can only get
 * the same answer. A refusal of what the batch holds (`PAYLOAD_TOO_LARGE`, `VALIDATION`) is answered
 * with half the batch, older half first, until it rests on one op sent alone: that op fails like
 * any write the server rejects (rolled back, listed in `rejected_commands` with the server's code)
 * and the ops behind it go on. Batches grow back as they get through.
 *
 * The queue holds instead, its ops still in line and the code in `refused`, when the refusal is
 * not about the batch's content, or when `HOLD_AFTER_REFUSED_ALONE` ops in a row were refused
 * alone with nothing accepted between them: then the server is refusing everything, and no more
 * writes are failed for it. `retryNow` (connectivity back), an explicit `flush` or the next app
 * start asks once more.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import {
  markCommandsDone,
  recordRejection,
  requeueCommands,
  type QueuedCommandRow,
} from './queue-store';
import { wireError, type SyncTransport } from './transport';
import { backoffDelayMs, DEFAULT_BACKOFF, type BackoffPolicy } from './upload-backoff';
import {
  isContentRefusal,
  isRefusal,
  isRejected,
  results,
  type UploadResult,
} from './upload-responses';

export { backoffDelayMs, DEFAULT_BACKOFF, type BackoffPolicy } from './upload-backoff';

/** Server caps (services/api `MAX_SYNC_BATCH_OPS`, 1 MB body limit), with headroom on bytes. */
export const MAX_BATCH_OPS = 500;
export const MAX_BATCH_BYTES = 900_000;

/**
 * Ops refused alone in a row before the queue stops failing writes and holds. One refused write is
 * the expected case and a second beside it happens (the same oversized thing tried twice); a third
 * with nothing accepted in between points at the server, not the writes, and holding costs only
 * time where failing costs the write. So a server that refuses everything fails two writes at
 * most.
 */
export const HOLD_AFTER_REFUSED_ALONE = 3;

export interface UploadQueueState {
  readonly sending: boolean;
  /** Consecutive failed attempts; 0 once a batch gets through. */
  readonly failures: number;
  readonly nextRetryAt: number | null;
  /** The backoff chosen for the pending retry, in ms. */
  readonly retryDelayMs: number | null;
  readonly lastError: string | null;
  /**
   * The code of the refusal that holds the queue: nothing is retried on a timer and nothing queued
   * behind it is sent. Null while the queue is sending, backing off or empty.
   */
  readonly refused: string | null;
}

export interface UploadQueueOptions {
  readonly db: AbstractPowerSyncDatabase;
  readonly transport: SyncTransport;
  readonly onSessionRevoked: () => Promise<void>;
  readonly backoff?: BackoffPolicy;
  readonly maxBatchOps?: number;
  readonly now?: () => number;
}

type AttemptOutcome =
  | { readonly kind: 'progress' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'retry'; readonly error: string; readonly retryAfterMs?: number }
  | { readonly kind: 'refused'; readonly error: string }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'stale' };

export function createUploadQueue(options: UploadQueueOptions) {
  const { db, transport } = options;
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const maxOps = Math.min(options.maxBatchOps ?? MAX_BATCH_OPS, MAX_BATCH_OPS);
  const now = options.now ?? Date.now;

  const idle: UploadQueueState = {
    sending: false,
    failures: 0,
    nextRetryAt: null,
    retryDelayMs: null,
    lastError: null,
    refused: null,
  };
  let state = idle;
  const listeners = new Set<(next: UploadQueueState) => void>();
  let generation = 0;
  let running: Promise<void> | null = null;
  let rerun = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let recovered = false;
  let stopped = false;
  // Halved each time the server refuses what a batch holds, doubled by each batch that gets
  // through: the refusal is pinned on one op in about two sends per halving, where starting over
  // at full size after every accepted batch would spend the upload rate limit on a long queue.
  let batchOps = maxOps;
  // Ops refused alone since the server last accepted a batch.
  let refusedAlone = 0;

  const SUCCESS: Partial<UploadQueueState> = {
    failures: 0,
    nextRetryAt: null,
    retryDelayMs: null,
    lastError: null,
    refused: null,
  };

  function setState(patch: Partial<UploadQueueState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  /**
   * Records the outcomes the server returned and puts every other op of the batch back in line,
   * in one transaction. `onCommit` runs inside it, so queue state it sets is visible no later than
   * the rows it describes.
   */
  async function settleBatch(
    batch: readonly QueuedCommandRow[],
    outcomes: readonly UploadResult[],
    requeueReason: string,
    onCommit: () => void = () => undefined,
  ) {
    const rejectedAt = new Date(now()).toISOString();
    await db.writeTransaction(async (tx) => {
      const done: string[] = [];
      for (const [index, row] of batch.entries()) {
        const outcome = outcomes[index];
        if (outcome === undefined) break;
        if (isRejected(outcome)) {
          await recordRejection(tx, {
            opId: row.id,
            code: outcome.code ?? 'INTERNAL',
            detail: outcome.detail,
            rejectedAt,
          });
        } else {
          done.push(row.id);
        }
      }
      await markCommandsDone(tx, done);
      await requeueCommands(
        tx,
        batch.map((row) => row.id),
        requeueReason,
      );
      onCommit();
    });
  }

  async function nextBatch(): Promise<QueuedCommandRow[]> {
    const rows = await db.getAll<QueuedCommandRow>(
      `SELECT id, seq, cmd, envelope, summary, status, attempts FROM commands
        WHERE status != 'done' ORDER BY seq LIMIT ?`,
      [batchOps],
    );
    const batch: QueuedCommandRow[] = [];
    let bytes = 0;
    for (const row of rows) {
      bytes += row.envelope.length + 1;
      if (batch.length > 0 && bytes > MAX_BATCH_BYTES) break;
      batch.push(row);
    }
    return batch;
  }

  async function attempt(gen: number): Promise<AttemptOutcome> {
    const batch = await nextBatch();
    if (batch.length === 0) return { kind: 'empty' };
    const ids = batch.map((row) => row.id);
    await db.execute(
      `UPDATE commands SET status = 'sending', attempts = attempts + 1, sent_at = ?
        WHERE id IN (${ids.map(() => '?').join(', ')})`,
      [new Date(now()).toISOString(), ...ids],
    );

    let response;
    try {
      const ops = batch.map((row) => JSON.parse(row.envelope) as unknown);
      response = await transport.postJson('/sync/upload', { ops });
    } catch (error) {
      if (gen !== generation) return { kind: 'stale' };
      await db.writeTransaction((tx) => requeueCommands(tx, ids, 'NETWORK'));
      return { kind: 'retry', error: error instanceof Error ? error.message : 'NETWORK' };
    }
    if (gen !== generation) return { kind: 'stale' };

    if (response.status >= 200 && response.status < 300) {
      const outcomes = results(response.body);
      // Ops the response did not cover (never expected) go back in line rather than stay `sending`.
      // A batch that got through clears the failure streak in the same transaction that marks its
      // ops done: no reader ever sees them done while the queue still reports a pending retry.
      await settleBatch(batch, outcomes, 'MISSING_RESULT', () => {
        if (outcomes.length > 0 && gen === generation) setState(SUCCESS);
      });
      if (outcomes.length > 0) {
        batchOps = Math.min(maxOps, batchOps * 2);
        refusedAlone = 0;
      }
      return outcomes.length > 0
        ? { kind: 'progress' }
        : { kind: 'retry', error: 'MISSING_RESULT' };
    }
    const error = wireError(response.body);
    if (response.status === 401 && error?.code === 'SESSION_REVOKED') return { kind: 'revoked' };
    const code = error?.code ?? `HTTP_${response.status}`;
    const refusal = isRefusal(response.status, error);
    const pinned = refusal && isContentRefusal(code) && batch.length === 1;
    if (pinned) refusedAlone = Math.min(refusedAlone + 1, HOLD_AFTER_REFUSED_ALONE);
    if (pinned && refusedAlone < HOLD_AFTER_REFUSED_ALONE) {
      // The server will never take this op, and said so about it alone: it fails like a rejected
      // one, and whatever is queued behind it follows at once.
      await settleBatch(batch, [{ status: 'rejected', code, detail: error?.detail }], code);
      return { kind: 'progress' };
    }
    if (response.status === 503) {
      const detail = error?.detail as { first_unprocessed?: number; results?: unknown } | undefined;
      const firstUnprocessed = Math.max(0, Math.min(detail?.first_unprocessed ?? 0, batch.length));
      await settleBatch(batch, results(detail).slice(0, firstUnprocessed), code);
    } else {
      await db.writeTransaction((tx) => requeueCommands(tx, ids, code));
    }
    if (refusal) {
      if (!isContentRefusal(code) || pinned) return { kind: 'refused', error: code };
      // A smaller batch is a different request: the older half goes first, at once.
      batchOps = Math.floor(batch.length / 2);
      return { kind: 'progress' };
    }
    const retryAfterS = (error?.detail as { retry_after_s?: unknown } | undefined)?.retry_after_s;
    return {
      kind: 'retry',
      error: code,
      ...(typeof retryAfterS === 'number' ? { retryAfterMs: retryAfterS * 1000 } : {}),
    };
  }

  function scheduleRetry(outcome: { error: string; retryAfterMs?: number }) {
    const failures = state.failures + 1;
    const delay = Math.max(backoffDelayMs(failures, backoff), outcome.retryAfterMs ?? 0);
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      // The retry is no longer pending once it starts; the failure count stays until it succeeds.
      setState({ nextRetryAt: null, retryDelayMs: null });
      void flush();
    }, delay);
    setState({
      failures,
      nextRetryAt: now() + delay,
      retryDelayMs: delay,
      lastError: outcome.error,
      refused: null,
    });
  }

  /** Holds the queue where it is: its ops stay in line and no timer sends them again. */
  function hold(code: string) {
    clearTimer();
    setState({
      failures: state.failures + 1,
      nextRetryAt: null,
      retryDelayMs: null,
      lastError: code,
      refused: code,
    });
  }

  async function run(): Promise<void> {
    const gen = generation;
    if (!recovered) {
      // A batch in flight when the app died never got its outcome: send it again (op_id dedupes).
      await db.execute(`UPDATE commands SET status = 'queued' WHERE status = 'sending'`);
      recovered = true;
    }
    setState({ sending: true });
    try {
      while (gen === generation) {
        const outcome = await attempt(gen);
        if (gen !== generation || outcome.kind === 'stale') return;
        if (outcome.kind === 'progress') continue;
        if (outcome.kind === 'empty') setState(SUCCESS);
        if (outcome.kind === 'retry') scheduleRetry(outcome);
        if (outcome.kind === 'refused') hold(outcome.error);
        if (outcome.kind === 'revoked') {
          generation += 1;
          setState({ sending: false });
          await options.onSessionRevoked();
        }
        return;
      }
    } catch (error) {
      // A local database failure mid-flush: retry later rather than surface an unhandled
      // rejection from a timer. After a reset or stop the failure belongs to abandoned work.
      if (gen === generation) {
        scheduleRetry({ error: error instanceof Error ? error.message : 'LOCAL_DB' });
      }
    } finally {
      if (gen === generation) setState({ sending: false });
    }
  }

  /** Flushes until the queue is empty or an attempt fails; concurrent calls share one run. */
  function flush(): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running !== null) {
      rerun = true;
      return running;
    }
    clearTimer();
    running = run().finally(() => {
      running = null;
      if (rerun && timer === null && state.refused === null && !stopped) {
        rerun = false;
        void flush();
      }
      rerun = false;
    });
    return running;
  }

  return {
    flush,
    /** A new op was queued: send it now unless a backoff is pending or a refusal holds the queue. */
    schedule(): void {
      if (timer === null && state.refused === null) void flush();
    },
    /** Connectivity came back or the app returned to the foreground: skip any pending backoff. */
    async retryNow(): Promise<void> {
      // A run already in flight may be about to schedule a backoff; start fresh after it.
      if (running !== null) await running;
      clearTimer();
      return flush();
    },
    /** Account switch: forget in-flight work and pending retries without touching the database. */
    reset(): void {
      generation += 1;
      clearTimer();
      recovered = false;
      batchOps = maxOps;
      refusedAlone = 0;
      setState(idle);
    },
    /**
     * Shuts the queue down for good before its database closes: pending retries are cancelled,
     * in-flight work is abandoned, and this resolves once nothing more will touch the database.
     */
    async stop(): Promise<void> {
      stopped = true;
      generation += 1;
      clearTimer();
      if (running !== null) await running;
      setState(idle);
    },
    getState: (): UploadQueueState => state,
    subscribe(listener: (next: UploadQueueState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;
