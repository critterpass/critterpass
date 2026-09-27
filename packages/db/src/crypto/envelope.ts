/**
 * AES-256-GCM envelope encryption for C3 fields (docs/data-model.md §3.1 `user_private`,
 * `device_action_keys.secret_enc`, the SIWA refresh token captured into `auth.account`). Key
 * material is always supplied by the caller (services/api/src/env.ts's `FIELD_ENCRYPTION_KEYS`,
 * generated with `openssl rand -base64 32`, never hardcoded): this module only knows how to use
 * keys, never how to obtain them. The stored string carries the key id it was encrypted under
 * (`v1:<keyId>:<ivB64url>:<tagB64url>:<ciphertextB64url>`) so `reencryptField` can decrypt under an
 * old (retained) key and re-encrypt under the current active one without a data migration.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface FieldEncryptionKeyring {
  /** The key id every new `encryptField` call uses; older ids stay in `keys` only to decrypt rows not yet re-encrypted. */
  readonly activeKeyId: string;
  /** 32-byte (AES-256) key per id. */
  readonly keys: Readonly<Record<string, Buffer>>;
}

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const ENVELOPE_VERSION = 'v1';
const AES_256_KEY_BYTES = 32;

function requireKey(keyring: FieldEncryptionKeyring, keyId: string): Buffer {
  const key = keyring.keys[keyId];
  if (!key) throw new Error(`no field encryption key registered for key id "${keyId}"`);
  if (key.length !== AES_256_KEY_BYTES) {
    throw new Error(`field encryption key "${keyId}" must be ${AES_256_KEY_BYTES} bytes (AES-256)`);
  }
  return key;
}

/** Encrypts `plaintext` under the keyring's current active key. */
export function encryptField(plaintext: string, keyring: FieldEncryptionKeyring): string {
  const key = requireKey(keyring, keyring.activeKeyId);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENVELOPE_VERSION,
    keyring.activeKeyId,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

interface ParsedEnvelope {
  readonly keyId: string;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly ciphertext: Buffer;
}

function parseEnvelope(stored: string): ParsedEnvelope {
  const parts = stored.split(':');
  const [version, keyId, ivB64, tagB64, ciphertextB64] = parts;
  if (
    parts.length !== 5 ||
    version !== ENVELOPE_VERSION ||
    !keyId ||
    !ivB64 ||
    !tagB64 ||
    !ciphertextB64
  ) {
    throw new Error('malformed field encryption envelope');
  }
  return {
    keyId,
    iv: Buffer.from(ivB64, 'base64url'),
    tag: Buffer.from(tagB64, 'base64url'),
    ciphertext: Buffer.from(ciphertextB64, 'base64url'),
  };
}

/** Decrypts a value produced by `encryptField`, under whichever key id it was stored with. */
export function decryptField(stored: string, keyring: FieldEncryptionKeyring): string {
  const { keyId, iv, tag, ciphertext } = parseEnvelope(stored);
  const key = requireKey(keyring, keyId);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Re-encrypts under the keyring's current active key id; a key-rotation sweep can call this
 * unconditionally on every row (a value already under the active key just round-trips) rather than
 * first checking which key id it carries.
 */
export function reencryptField(stored: string, keyring: FieldEncryptionKeyring): string {
  return encryptField(decryptField(stored, keyring), keyring);
}

/**
 * Parses `FIELD_ENCRYPTION_KEYS` env format: `keyId1:base64key1,keyId2:base64key2`. The first entry's
 * id becomes irrelevant here — callers pair this with a separate `FIELD_ENCRYPTION_ACTIVE_KEY_ID`
 * env var so which key is "active" is an explicit, independently-rotatable setting.
 */
export function parseFieldEncryptionKeys(spec: string): Readonly<Record<string, Buffer>> {
  const keys: Record<string, Buffer> = {};
  for (const entry of spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separatorIndex = entry.indexOf(':');
    if (separatorIndex === -1) throw new Error(`invalid field encryption key entry "${entry}"`);
    const keyId = entry.slice(0, separatorIndex);
    const keyBase64 = entry.slice(separatorIndex + 1);
    keys[keyId] = Buffer.from(keyBase64, 'base64');
  }
  return keys;
}
