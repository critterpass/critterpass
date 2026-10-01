/**
 * The platform-neutral half of the local-first stack (docs/system-architecture.md §4.2): upload
 * queue, command client and reconcile over an opened database, and the per-uid connect that binds
 * the database to its owner before PowerSync starts syncing. React Native (./db.ts) and Node (the
 * end-to-end sync harness) assemble the same pieces through here; only the database opener,
 * connectivity source and device identity differ per platform.
 */
import type { CommandDevice } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { createCommandClient, type CommandClient } from '../commands/client';
import { startReconcile } from '../commands/reconcile';
import { createSyncConnector } from './connector';
import { bindLocalOwner } from './reset';
import type { SyncTransport } from './transport';
import { createUploadQueue, type BackoffPolicy, type UploadQueue } from './upload-queue';

export interface LocalFirstCoreOptions {
  readonly db: AbstractPowerSyncDatabase;
  readonly transport: SyncTransport;
  /** The signed-in uid at the time a command is built. */
  readonly uid: () => string;
  readonly device: () => Promise<CommandDevice>;
  /** `SESSION_REVOKED` from the upload door: the sign-out hooks wipe local data. */
  readonly onSessionRevoked: () => Promise<void>;
  readonly backoff?: BackoffPolicy;
}

export interface LocalFirstCore {
  readonly db: AbstractPowerSyncDatabase;
  readonly queue: UploadQueue;
  readonly commands: CommandClient;
  /** Stops reconciling synced command results. */
  readonly stopReconcile: () => void;
}

export function assembleLocalFirstCore(options: LocalFirstCoreOptions): LocalFirstCore {
  const { db, transport } = options;
  const queue = createUploadQueue({
    db,
    transport,
    onSessionRevoked: options.onSessionRevoked,
    ...(options.backoff !== undefined ? { backoff: options.backoff } : {}),
  });
  const commands = createCommandClient({
    db,
    queue,
    transport,
    uid: options.uid,
    device: options.device,
  });
  const stopReconcile = startReconcile(db);
  return { db, queue, commands, stopReconcile };
}

export interface ConnectLocalFirstOptions {
  readonly uid: string;
  /** PowerSync service URL. */
  readonly endpoint: string;
  readonly getSyncToken: () => Promise<string>;
}

export interface LocalFirstConnection {
  /**
   * Settles once the first sync attempt has connected or failed. It never rejects: a failed start
   * is reported, and PowerSync keeps retrying on its own.
   */
  readonly connected: Promise<void>;
}

/**
 * Binds the database to `uid` (wiping another uid's data first), then starts syncing and sends
 * whatever the queue still holds. It returns as soon as the owner is bound: from there the phone's
 * own data is readable, and that must never wait on a network attempt. `db.connect` only settles
 * when the first sync attempt has connected or failed (a sync token request, then the stream),
 * which on a stalled connection can take as long as the platform lets a request hang.
 */
export async function connectLocalFirst(
  core: Pick<LocalFirstCore, 'db' | 'queue'>,
  options: ConnectLocalFirstOptions,
): Promise<LocalFirstConnection> {
  const { db, queue } = core;
  await bindLocalOwner(db, queue, options.uid);
  const connected = db
    .connect(
      createSyncConnector({
        endpoint: options.endpoint,
        getSyncToken: options.getSyncToken,
        flushCommands: () => queue.flush(),
      }),
    )
    .catch((error: unknown) => {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing log prefix.
      console.warn('[local-first] sync did not start', error);
    });
  // Uploads go over HTTP, not the sync stream: they do not wait for it either.
  queue.schedule();
  return { connected };
}
