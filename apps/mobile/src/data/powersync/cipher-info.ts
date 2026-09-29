/**
 * Which cipher engine encrypts the local database, read from the open database itself. On iOS
 * SQLCipher must report the `commoncrypto` provider: the app declares it uses only the OS's own
 * encryption, so a build linked against a bundled crypto library would contradict that.
 */
/* eslint-disable lingui/no-unlocalized-strings -- developer diagnostics (docs/system-architecture.md
   §3); every literal is SQL or a label shown only on the developer tools screen. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export interface DatabaseCipherInfo {
  /** `PRAGMA cipher_version`; null when the engine is not SQLCipher. */
  readonly version: string | null;
  /** `PRAGMA cipher_provider` (`commoncrypto`, `openssl`, ...); null when not reported. */
  readonly provider: string | null;
}

type Queryable = Pick<AbstractPowerSyncDatabase, 'getOptional'>;

async function readPragma(db: Queryable, pragma: string): Promise<string | null> {
  const row = await db.getOptional<Record<string, unknown>>(`PRAGMA ${pragma}`);
  const value = row === null ? undefined : Object.values(row)[0];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function readDatabaseCipherInfo(db: Queryable): Promise<DatabaseCipherInfo> {
  return {
    version: await readPragma(db, 'cipher_version'),
    provider: await readPragma(db, 'cipher_provider'),
  };
}

/** One line for the developer tools screen, e.g. `SQLCipher 4.19.0 · commoncrypto`. */
export function describeCipher(info: DatabaseCipherInfo): string {
  if (info.version === null) return 'not SQLCipher';
  return `SQLCipher ${info.version} · ${info.provider ?? 'unknown provider'}`;
}
