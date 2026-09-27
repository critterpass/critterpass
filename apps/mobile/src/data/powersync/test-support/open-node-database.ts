/**
 * Node counterpart of ../db.ts for tests: the same schema, key management and
 * `openEncryptedDatabase` checks, on @powersync/node with SQLite3 Multiple Ciphers configured for
 * SQLCipher 4's on-disk format (`cipher = 'sqlcipher'`, `legacy = 4`) — the format op-sqlite's
 * SQLCipher build writes on device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AbstractPowerSyncDatabase, Schema } from '@powersync/common';

import { loadOrCreateDatabaseKey, type KeyStore, type KeyStoreOptions } from '../encryption-key';
import { openEncryptedDatabase, type EncryptedDatabaseSource } from '../open-database';
import { buildAppSchema } from '../schema';
import { powersyncNode, workerThreads } from './node-realm';

const CIPHER_WORKER = path.join(__dirname, 'cipher-worker.mjs');
export const TEST_DB_FILENAME = 'critterpass.db';

/** An in-memory stand-in for the Keychain / Keystore that records the options it was given. */
export class MemoryKeyStore implements KeyStore {
  readonly items = new Map<string, string>();
  readonly options: KeyStoreOptions[] = [];

  getItemAsync(key: string, options: KeyStoreOptions): Promise<string | null> {
    this.options.push(options);
    return Promise.resolve(this.items.get(key) ?? null);
  }

  setItemAsync(key: string, value: string, options: KeyStoreOptions): Promise<void> {
    this.options.push(options);
    this.items.set(key, value);
    return Promise.resolve();
  }
}

export function tempDatabaseDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'cp-local-db-'));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** A fixed stand-in for `SecureStore.AFTER_FIRST_UNLOCK` (a native constant absent under Node). */
export const AFTER_FIRST_UNLOCK = 0;

export function installKey(store: KeyStore): Promise<string> {
  return loadOrCreateDatabaseKey(
    store,
    (count) => new Uint8Array(randomBytes(count)),
    AFTER_FIRST_UNLOCK,
  );
}

export interface NodeDatabaseOptions {
  readonly dir: string;
  readonly key: string | null;
  readonly schema?: Schema;
  readonly filename?: string;
}

/** `key: null` opens with the SDK's default plain-SQLite worker (no cipher at all). */
export function nodeDatabaseSource(options: NodeDatabaseOptions): EncryptedDatabaseSource {
  const filename = options.filename ?? TEST_DB_FILENAME;
  const schema = options.schema ?? buildAppSchema();
  const { key } = options;
  return {
    open: () =>
      new powersyncNode.PowerSyncDatabase({
        schema,
        database: {
          dbFilename: filename,
          dbLocation: options.dir,
          ...(key === null
            ? {}
            : {
                openWorker: (_url: string | URL, workerOptions?: object) =>
                  new workerThreads.Worker(CIPHER_WORKER, {
                    ...workerOptions,
                    workerData: { key },
                  }),
              }),
        },
      }),
    destroy: () => {
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(path.join(options.dir, `${filename}${suffix}`), { force: true });
      }
      return Promise.resolve();
    },
    // SQLite3 Multiple Ciphers names its active cipher; plain SQLite answers with no row.
    cipherProbe: 'PRAGMA cipher',
  };
}

export function openNodeDatabase(options: NodeDatabaseOptions): Promise<AbstractPowerSyncDatabase> {
  return openEncryptedDatabase(nodeDatabaseSource(options));
}
