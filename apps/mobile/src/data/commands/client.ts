/**
 * The app's one write path (docs/api-contracts.md §2): every write is a `CommandEnvelope` with a
 * client UUIDv7 `op_id`. Offline-capable commands are queued locally — envelope, summary and
 * optimistic overlay rows in one local transaction — and uploaded in order by the upload queue;
 * online-only commands go straight to `POST /v1/cmd/{cmd}` and answer synchronously.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, wire value or developer-facing error, never copy. */
import { generateUuidV7, type CommandDevice } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { insertQueuedCommand } from '../powersync/queue-store';
import { wireError, type SyncTransport } from '../powersync/transport';
import { writeOverlays, type OverlayWrite } from './overlays';
import { summarize, type ClientCommandSpec } from './summaries';

export interface SendOptions {
  /** Optimistic rows shown until the server's own rows sync (offline-capable commands only). */
  readonly optimistic?: readonly OverlayWrite[];
  /** The aggregate version this write was based on, where the aggregate is versioned. */
  readonly baseVersion?: number;
}

export type SendResult =
  | { readonly kind: 'queued'; readonly opId: string }
  | { readonly kind: 'applied'; readonly opId: string; readonly result: unknown }
  | {
      readonly kind: 'rejected';
      readonly opId: string;
      readonly code: string;
      readonly detail?: unknown;
    }
  /** An online-only command could not reach the server, or the server failed transiently. */
  | { readonly kind: 'unavailable'; readonly opId: string; readonly code: string };

export interface CommandClientOptions {
  readonly db: AbstractPowerSyncDatabase;
  readonly queue: { schedule(): void };
  readonly transport: SyncTransport;
  /** The signed-in uid (the server overwrites and asserts it). */
  readonly uid: () => string;
  readonly device: () => Promise<CommandDevice>;
  readonly now?: () => Date;
}

/** The error envelope's `retryable`; without one, only 5xx and 429 are worth another try. */
function isRetryable(body: unknown, status: number): boolean {
  const retryable = (body as { error?: { retryable?: unknown } }).error?.retryable;
  if (typeof retryable === 'boolean') return retryable;
  return status >= 500 || status === 429;
}

export function createCommandClient(options: CommandClientOptions) {
  const now = options.now ?? (() => new Date());

  async function envelope<Payload>(
    spec: ClientCommandSpec<Payload>,
    payload: Payload,
    via: 'app' | 'offline',
    baseVersion: number | undefined,
  ) {
    return {
      op_id: generateUuidV7(),
      cmd: spec.name,
      v: 1 as const,
      actor: { uid: options.uid(), via },
      device: await options.device(),
      client_ts: now().toISOString(),
      ...(baseVersion !== undefined ? { base_version: baseVersion } : {}),
      payload,
    };
  }

  async function sendOnline<Payload>(
    spec: ClientCommandSpec<Payload>,
    payload: Payload,
    baseVersion: number | undefined,
  ): Promise<SendResult> {
    const env = await envelope(spec, payload, 'app', baseVersion);
    const opId = env.op_id;
    let response;
    try {
      response = await options.transport.postJson(`/v1/cmd/${spec.name}`, env);
    } catch {
      return { kind: 'unavailable', opId, code: 'NETWORK' };
    }
    if (response.status === 200) {
      return { kind: 'applied', opId, result: (response.body as { result?: unknown }).result };
    }
    const error = wireError(response.body);
    if (error === null) {
      return { kind: 'unavailable', opId, code: `HTTP_${response.status}` };
    }
    // The error's own `retryable` flag decides (docs/api-contracts.md §3): `RATE_LIMITED` or
    // `INTERNAL` may pass on a later try, while `NUDGE_TOO_SOON` (429) or `VALIDATION` never will.
    if (isRetryable(response.body, response.status)) {
      return { kind: 'unavailable', opId, code: error.code };
    }
    return { kind: 'rejected', opId, code: error.code, detail: error.detail };
  }

  async function send<Payload>(
    spec: ClientCommandSpec<Payload>,
    payload: Payload,
    sendOptions: SendOptions = {},
  ): Promise<SendResult> {
    const optimistic = sendOptions.optimistic ?? [];
    if (!spec.offline) {
      if (optimistic.length > 0) {
        throw new Error(`${spec.name} is online-only and cannot write optimistic rows`);
      }
      return sendOnline(spec, payload, sendOptions.baseVersion);
    }

    const env = await envelope(spec, payload, 'offline', sendOptions.baseVersion);
    await options.db.writeTransaction(async (tx) => {
      await insertQueuedCommand(tx, {
        opId: env.op_id,
        cmd: spec.name,
        envelope: env,
        summary: summarize(spec, payload),
        createdAt: env.client_ts,
      });
      await writeOverlays(tx, env.op_id, optimistic);
    });
    options.queue.schedule();
    return { kind: 'queued', opId: env.op_id };
  }

  return { send };
}

export type CommandClient = ReturnType<typeof createCommandClient>;
