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
import { createDeviceResolver } from '../commands/device';
import { resolveApiBaseUrl } from '../places/apiBaseUrl';
import { createExpoNetworkSource, retryWhenOnline } from '../status/network';
import { resolvePowerSyncUrl } from './connector';
import { loadOrCreateDatabaseKey } from './encryption-key';
import { assembleLocalFirstCore, connectLocalFirst } from './local-first';
import type { LocalFirstContextValue } from './local-first-context';
import { openEncryptedDatabase } from './open-database';
import { registerLocalDataReset } from './reset';
import { buildAppSchema } from './schema';
import { createFetchTransport } from './transport';

export const DATABASE_FILENAME = 'critterpass.db';

/** SQLCipher answers this with its version; a plain SQLite build returns no row. */
const SQLCIPHER_PROBE = 'PRAGMA cipher_version';

export interface LocalFirstAuth {
  /** `aud: sync` JWT for PowerSync (auth data layer `getSyncToken`). */
  getSyncToken(): Promise<string>;
  /** Session headers for api calls, e.g. `{cookie: await authClient.getCookie()}`. */
  sessionHeaders(): Promise<Record<string, string>>;
}

let opening: Promise<AbstractPowerSyncDatabase> | null = null;
let current: LocalFirstContextValue | null = null;
let activeAuth: LocalFirstAuth | null = null;
let activeUid: string | null = null;

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

function requireAuth(): LocalFirstAuth {
  if (activeAuth === null) throw new Error('startLocalFirst has not run for a signed-in user');
  return activeAuth;
}

function requireUid(): string {
  if (activeUid === null) throw new Error('startLocalFirst has not run for a signed-in user');
  return activeUid;
}

/** Queue, command client, connectivity and reconcile over the database; built once per process. */
function assemble(db: AbstractPowerSyncDatabase): LocalFirstContextValue {
  const transport = createFetchTransport({
    baseUrl: resolveApiBaseUrl(),
    sessionHeaders: () => requireAuth().sessionHeaders(),
  });
  const { queue, commands } = assembleLocalFirstCore({
    db,
    transport,
    uid: requireUid,
    device: createDeviceResolver(),
    onSessionRevoked: runOnSignOutHooks,
  });
  const network = createExpoNetworkSource();
  retryWhenOnline(network, queue);
  return { db, queue, commands, network };
}

/**
 * Starts sync and uploads for the signed-in `uid` (anonymous included) and returns the value for
 * `LocalFirstProvider`. Call after every sign-in or merge: a database still holding another uid's
 * data is wiped before connecting.
 */
export async function startLocalFirst(
  auth: LocalFirstAuth,
  uid: string,
): Promise<LocalFirstContextValue> {
  activeAuth = auth;
  activeUid = uid;
  const db = await getAppDatabase();
  current ??= assemble(db);
  await connectLocalFirst(current, {
    uid,
    endpoint: resolvePowerSyncUrl(),
    getSyncToken: () => requireAuth().getSyncToken(),
  });
  return current;
}

export function getLocalFirst(): LocalFirstContextValue | null {
  return current;
}
