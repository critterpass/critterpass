/**
 * Opens the encrypted client database and refuses to run unencrypted. Platform-neutral: the
 * React Native opener (./db.ts, op-sqlite + SQLCipher) and the Node opener used by tests
 * (@powersync/node + SQLite3 Multiple Ciphers in SQLCipher mode) both go through it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export interface EncryptedDatabaseSource {
  /** A fresh, not yet initialised database handle opened with the install's key. */
  open(): AbstractPowerSyncDatabase;
  /** Deletes the database files (used when they cannot be decrypted with the install's key). */
  destroy(): Promise<void>;
  /**
   * Engine-specific query proving a cipher is active: it must return a row whose first value is a
   * non-empty string (SQLCipher: `PRAGMA cipher_version`).
   */
  readonly cipherProbe: string;
}

const UNREADABLE = /not a database|SQLITE_NOTADB|file is encrypted/i;

/** Duck-typed: errors raised inside a SQLite worker or native module need not be `Error`s here. */
export function isUnreadableDatabaseError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { message, cause } = error as { message?: unknown; cause?: unknown };
  return UNREADABLE.test(`${String(message)} ${String(cause)}`);
}

async function assertEncrypted(db: AbstractPowerSyncDatabase, probe: string): Promise<void> {
  const row = await db.getOptional<Record<string, unknown>>(probe);
  const value = row === null ? undefined : Object.values(row)[0];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('local database opened without encryption; refusing to store data');
  }
}

/**
 * `close()` waits for a successful init, so after a failed one it neither closes the SQLite
 * connection (which must be closed before the files are deleted) nor stops the SDK's trigger
 * cleanup timer, which would otherwise fire every two minutes on a dead database.
 */
async function releaseFailedDatabase(db: AbstractPowerSyncDatabase): Promise<void> {
  await db.close().catch(() => undefined);
  (db.triggers as { dispose?: () => void }).dispose?.();
  await Promise.resolve()
    .then(() => db.database.close())
    .catch(() => undefined);
}

async function initialised(source: EncryptedDatabaseSource) {
  const db = source.open();
  try {
    await db.init();
    await assertEncrypted(db, source.cipherProbe);
    return db;
  } catch (error) {
    await releaseFailedDatabase(db);
    throw error;
  }
}

/**
 * Opens and verifies the database. Files the key cannot decrypt (restored from a backup without
 * the Keychain/Keystore entry, or a key lost with a reinstall) are deleted and recreated: synced
 * data comes back from the server, and the unreadable queue could never have been sent anyway.
 */
export async function openEncryptedDatabase(
  source: EncryptedDatabaseSource,
): Promise<AbstractPowerSyncDatabase> {
  try {
    return await initialised(source);
  } catch (error) {
    if (!isUnreadableDatabaseError(error)) throw error;
    await source.destroy();
    return initialised(source);
  }
}
