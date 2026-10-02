/**
 * The platform-neutral half of the local-first stack (docs/system-architecture.md §4.2): upload
 * queue, command client and reconcile over an opened database, and the per-uid connect that binds
 * the database to its owner before PowerSync starts syncing. React Native (./db.ts) and Node (the
 * end-to-end sync harness) assemble the same pieces through here; only the database opener,
 * connectivity source and device identity differ per platform.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL or a developer-facing log or error, never copy. */
import type { CommandDevice } from '@cp/domain';
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/common';

import { createCommandClient, type CommandClient } from '../commands/client';
import { startReconcile } from '../commands/reconcile';
import type { NetworkSource } from '../status/network';
import { createSyncConnector } from './connector';
import { OWNER_UID_KEY } from './local-tables';
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

/** The connection a database last started; a newer start replaces it. */
const latest = new WeakMap<AbstractPowerSyncDatabase, { stop: () => void }>();

/**
 * The connector, with a credentials request that ends when PowerSync abandons the attempt. A token
 * request left hanging would otherwise hold PowerSync's disconnect, and every reconnect behind it.
 */
function abortableCredentials(connector: PowerSyncBackendConnector): PowerSyncBackendConnector {
  return {
    ...connector,
    fetchCredentials: (signal?: AbortSignal) => {
      const credentials = connector.fetchCredentials();
      if (signal === undefined) return credentials;
      return new Promise((resolve, reject) => {
        const abandon = () => reject(new Error('the sync attempt was abandoned'));
        if (signal.aborted) abandon();
        signal.addEventListener('abort', abandon, { once: true });
        credentials.then(resolve, reject).finally(() => {
          signal.removeEventListener('abort', abandon);
        });
      });
    },
  };
}

async function stillOwnedBy(db: AbstractPowerSyncDatabase, uid: string): Promise<boolean> {
  const owner = await db.getOptional<{ value: string }>(
    'SELECT value FROM local_state WHERE id = ?',
    [OWNER_UID_KEY],
  );
  return owner?.value === uid;
}

/**
 * Restarts sync when the phone comes back online and sync is not connected. A request made the
 * moment the network returns can hang without ever failing (React Native's Android fetch has no
 * timeout), and PowerSync only retries an attempt that has failed: without this, one such request
 * stops sync until the app is relaunched. Only the newest connection does it, and only while the
 * database still belongs to its uid (a sign-out wipes the owner).
 */
function reconnectWhenOnline(
  db: AbstractPowerSyncDatabase,
  network: NetworkSource,
  uid: string,
  connector: PowerSyncBackendConnector,
): void {
  latest.get(db)?.stop();
  const current = {
    stop: network.subscribe((online) => {
      if (!online || db.currentStatus.connected) return;
      void stillOwnedBy(db, uid)
        .then((owned) => {
          if (!owned || latest.get(db) !== current || db.currentStatus.connected) return;
          return db.connect(connector);
        })
        .catch((error: unknown) => {
          console.warn('[local-first] sync did not restart', error);
        });
    }),
  };
  latest.set(db, current);
}

/**
 * Binds the database to `uid` (wiping another uid's data first), then starts syncing and sends
 * whatever the queue still holds. It returns as soon as the owner is bound: from there the phone's
 * own data is readable, and that must never wait on a network attempt. `db.connect` only settles
 * when the first sync attempt has connected or failed (a sync token request, then the stream),
 * which on a stalled connection can take as long as the platform lets a request hang. With a
 * `network`, sync is restarted whenever the phone comes back online without it.
 */
export async function connectLocalFirst(
  core: Pick<LocalFirstCore, 'db' | 'queue'> & { readonly network?: NetworkSource },
  options: ConnectLocalFirstOptions,
): Promise<LocalFirstConnection> {
  const { db, queue } = core;
  await bindLocalOwner(db, queue, options.uid);
  const connector = abortableCredentials(
    createSyncConnector({
      endpoint: options.endpoint,
      getSyncToken: options.getSyncToken,
      flushCommands: () => queue.flush(),
    }),
  );
  if (core.network !== undefined) {
    reconnectWhenOnline(db, core.network, options.uid, connector);
  }
  const connected = db.connect(connector).catch((error: unknown) => {
    console.warn('[local-first] sync did not start', error);
  });
  // Uploads go over HTTP, not the sync stream: they do not wait for it either.
  queue.schedule();
  return { connected };
}
