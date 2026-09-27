/**
 * The app's one local-first database (docs/system-architecture.md §4.2): PowerSync over op-sqlite
 * built with SQLCipher (`"op-sqlite": {"sqlcipher": true}` in package.json), keyed by a per-install
 * secret in the Keychain / Android Keystore. React Native only; everything it wires together is
 * platform-neutral and tested under Node against a real SQLCipher-format database.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import { open as openOpSqlite } from '@op-engineering/op-sqlite';
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { PowerSyncDatabase } from '@powersync/react-native';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { runOnSignOutHooks } from '../auth/sign-out-hooks';
import { resolveApiBaseUrl } from '../places/apiBaseUrl';
import { createSyncConnector, resolvePowerSyncUrl } from './connector';
import { loadOrCreateDatabaseKey } from './encryption-key';
import { openEncryptedDatabase } from './open-database';
import { bindLocalOwner, registerLocalDataReset } from './reset';
import { buildAppSchema } from './schema';
import { createFetchTransport } from './transport';
import { createUploadQueue, type UploadQueue } from './upload-queue';

export const DATABASE_FILENAME = 'critterpass.db';

/** SQLCipher answers this with its version; a plain SQLite build returns no row. */
const SQLCIPHER_PROBE = 'PRAGMA cipher_version';

export interface LocalFirstAuth {
  /** `aud: sync` JWT for PowerSync (auth data layer `getSyncToken`). */
  getSyncToken(): Promise<string>;
  /** Session headers for api calls, e.g. `{cookie: await authClient.getCookie()}`. */
  sessionHeaders(): Promise<Record<string, string>>;
}

export interface LocalFirst {
  readonly db: AbstractPowerSyncDatabase;
  readonly queue: UploadQueue;
}

let opening: Promise<AbstractPowerSyncDatabase> | null = null;
let current: LocalFirst | null = null;

// Sign-out, merge and SESSION_REVOKED all run the auth layer's hooks; this one wipes local data.
registerLocalDataReset(() => current);

async function openAppDatabase(): Promise<AbstractPowerSyncDatabase> {
  const key = await loadOrCreateDatabaseKey(
    SecureStore,
    getRandomBytes,
    SecureStore.AFTER_FIRST_UNLOCK,
  );
  return openEncryptedDatabase({
    open: () =>
      new PowerSyncDatabase({
        schema: buildAppSchema(),
        database: { dbFilename: DATABASE_FILENAME, sqliteOptions: { encryptionKey: key } },
      }),
    destroy: () => {
      openOpSqlite({ name: DATABASE_FILENAME, encryptionKey: key }).delete();
      return Promise.resolve();
    },
    cipherProbe: SQLCIPHER_PROBE,
  });
}

/** The opened database, shared by every caller; opened once per process. */
export function getAppDatabase(): Promise<AbstractPowerSyncDatabase> {
  opening ??= openAppDatabase().catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

/**
 * Starts sync and uploads for the signed-in `uid` (anonymous included). Call after every sign-in
 * or merge: a database still holding another uid's data is wiped before connecting.
 */
export async function startLocalFirst(auth: LocalFirstAuth, uid: string): Promise<LocalFirst> {
  const db = await getAppDatabase();
  const queue =
    current?.queue ??
    createUploadQueue({
      db,
      transport: createFetchTransport({
        baseUrl: resolveApiBaseUrl(),
        sessionHeaders: () => auth.sessionHeaders(),
      }),
      onSessionRevoked: runOnSignOutHooks,
    });
  current = { db, queue };
  await bindLocalOwner(db, queue, uid);
  await db.connect(
    createSyncConnector({
      endpoint: resolvePowerSyncUrl(),
      getSyncToken: () => auth.getSyncToken(),
      flushCommands: () => queue.flush(),
    }),
  );
  queue.schedule();
  return current;
}

export function getLocalFirst(): LocalFirst | null {
  return current;
}
