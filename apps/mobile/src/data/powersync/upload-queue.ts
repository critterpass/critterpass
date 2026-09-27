/**
 * Flushes the local `commands` queue to `POST /sync/upload` in insertion order
 * (docs/api-contracts.md §2.2, §5.2). Per batch: 2xx → every op has an outcome (applied/duplicate →
 * `done`, rejected → rolled back into `rejected_commands`) and the next batch follows at once; 503 →
 * the outcomes before `detail.first_unprocessed` are kept and the rest wait for a retry; no response
 * or any other failure → the whole batch waits. Retries back off exponentially with jitter, and a
 * newer op never overtakes an older one. `SESSION_REVOKED` stops everything and hands over to the
 * sign-out hooks, which wipe the database.
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

/** Server caps (services/api `MAX_SYNC_BATCH_OPS`, 1 MB body limit), with headroom on bytes. */
export const MAX_BATCH_OPS = 500;
export const MAX_BATCH_BYTES = 900_000;

export interface BackoffPolicy {
  readonly baseMs: number;
  readonly maxMs: number;
  /** Jitter source in [0, 1]; the delay is drawn from [delay/2, delay]. */
  readonly random: () => number;
}

export const DEFAULT_BACKOFF: BackoffPolicy = {
  baseMs: 1_000,
  maxMs: 300_000,
  random: Math.random,
};

export interface UploadQueueState {
  readonly sending: boolean;
  /** Consecutive failed attempts; 0 once a batch gets through. */
  readonly failures: number;
  readonly nextRetryAt: number | null;
  /** The backoff chosen for the pending retry, in ms. */
  readonly retryDelayMs: number | null;
  readonly lastError: string | null;
}

export interface UploadQueueOptions {
  readonly db: AbstractPowerSyncDatabase;
  readonly transport: SyncTransport;
  readonly onSessionRevoked: () => Promise<void>;
  readonly backoff?: BackoffPolicy;
  readonly maxBatchOps?: number;
  readonly now?: () => number;
}

interface UploadResult {
  readonly status: 'applied' | 'rejected' | 'duplicate';
  readonly code?: string;
  readonly detail?: unknown;
}

type AttemptOutcome =
  | { readonly kind: 'progress' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'retry'; readonly error: string; readonly retryAfterMs?: number }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'stale' };

export function backoffDelayMs(failures: number, policy: BackoffPolicy): number {
  const full = Math.min(policy.maxMs, policy.baseMs * 2 ** Math.max(0, failures - 1));
  return Math.round(full / 2 + policy.random() * (full / 2));
}

function isRejected(result: UploadResult): boolean {
  // A duplicate that carries a code replays an op the server originally rejected.
  return (
    result.status === 'rejected' || (result.status === 'duplicate' && result.code !== undefined)
  );
}

function results(body: unknown): UploadResult[] {
  const list = (body as { results?: unknown } | null)?.results;
  return Array.isArray(list) ? (list as UploadResult[]) : [];
}

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
  };
  let state = idle;
  const listeners = new Set<(next: UploadQueueState) => void>();
  let generation = 0;
  let running: Promise<void> | null = null;
  let rerun = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let recovered = false;
  let stopped = false;

  const SUCCESS: Partial<UploadQueueState> = {
    failures: 0,
    nextRetryAt: null,
    retryDelayMs: null,
    lastError: null,
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
      [maxOps],
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
      return outcomes.length > 0
        ? { kind: 'progress' }
        : { kind: 'retry', error: 'MISSING_RESULT' };
    }
    const error = wireError(response.body);
    if (response.status === 401 && error?.code === 'SESSION_REVOKED') return { kind: 'revoked' };
    const code = error?.code ?? `HTTP_${response.status}`;
    if (response.status === 503) {
      const detail = error?.detail as { first_unprocessed?: number; results?: unknown } | undefined;
      const firstUnprocessed = Math.max(0, Math.min(detail?.first_unprocessed ?? 0, batch.length));
      await settleBatch(batch, results(detail).slice(0, firstUnprocessed), code);
    } else {
      await db.writeTransaction((tx) => requeueCommands(tx, ids, code));
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
      if (rerun && timer === null && !stopped) {
        rerun = false;
        void flush();
      }
      rerun = false;
    });
    return running;
  }

  return {
    flush,
    /** A new op was queued: send it now unless a backoff is pending. */
    schedule(): void {
      if (timer === null) void flush();
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
