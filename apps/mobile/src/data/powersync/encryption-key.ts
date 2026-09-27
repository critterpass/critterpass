/**
 * The local database's SQLCipher key (docs/data-model-sync-and-privacy.md §1: SQLCipher-encrypted
 * PowerSync SQLite, key in Keychain / Android Keystore via expo-secure-store). 32 random bytes are
 * generated once per install and stored hex-encoded; the same string is the SQLCipher passphrase
 * on every open. Readable after first unlock (background sync and extension drains run while the
 * phone is locked) and never behind biometrics, which would block sync on every cold start.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */

export const DATABASE_KEY_ITEM = 'cp.local-db.key';
export const DATABASE_KEY_BYTES = 32;

export interface KeyStoreOptions {
  readonly requireAuthentication: false;
  readonly keychainAccessible: number;
}

/** The subset of `expo-secure-store` this module uses. */
export interface KeyStore {
  getItemAsync(key: string, options: KeyStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options: KeyStoreOptions): Promise<void>;
}

export type RandomBytes = (count: number) => Uint8Array;

const HEX_KEY = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the install's database key, creating and storing it on first use. A stored value that
 * is not a 64-char hex key is treated as absent: a truncated or foreign value would otherwise
 * become the passphrase for a new database nobody can reopen consistently.
 */
export async function loadOrCreateDatabaseKey(
  store: KeyStore,
  randomBytes: RandomBytes,
  keychainAccessible: number,
): Promise<string> {
  const options: KeyStoreOptions = { requireAuthentication: false, keychainAccessible };
  const existing = await store.getItemAsync(DATABASE_KEY_ITEM, options);
  if (existing !== null && HEX_KEY.test(existing)) return existing;

  const bytes = randomBytes(DATABASE_KEY_BYTES);
  if (bytes.length !== DATABASE_KEY_BYTES) {
    throw new Error(`random source returned ${bytes.length} bytes, expected ${DATABASE_KEY_BYTES}`);
  }
  const key = toHex(bytes);
  await store.setItemAsync(DATABASE_KEY_ITEM, key, options);
  return key;
}
