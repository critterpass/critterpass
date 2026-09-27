/**
 * Device action key issuance and rotation (docs/api-contracts-async.md §5). The plaintext secret is
 * generated here and returned exactly once, to the caller that just proved it owns the session
 * issuing the key (a later phase's `POST /v1/devices/{id}/action-keys`); only its
 * AES-256-GCM-encrypted form (`packages/db/src/crypto`) is ever stored.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { crypto as dbCrypto, withSystem } from '@cp/db';
import type { ActionKeyScope } from '@cp/domain';
import type pg from 'pg';

const { encryptField } = dbCrypto;
type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

/** 30 d rolling lifetime (docs/api-contracts-async.md §5). */
const KEY_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Rotated on app foreground when fewer than 7 d remain. */
const ROTATE_WHEN_REMAINING_SECONDS = 60 * 60 * 24 * 7;
const SECRET_BYTES = 32;

export interface IssuedActionKey {
  readonly keyId: string;
  /** Base64url, plaintext, 32 bytes — never persisted or logged; the caller must hand this to the client and discard its own copy immediately after. */
  readonly secret: string;
  readonly deviceId: string;
  readonly scopes: readonly ActionKeyScope[];
  readonly expiresAt: Date;
}

export interface IssueActionKeyInput {
  readonly userId: string;
  readonly deviceId: string;
  readonly scopes: readonly ActionKeyScope[];
}

export async function issueActionKey(
  pool: pg.Pool,
  input: IssueActionKeyInput,
  keyring: FieldEncryptionKeyring,
): Promise<IssuedActionKey> {
  const keyId = randomUUID();
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + KEY_TTL_SECONDS * 1000);
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [keyId, input.deviceId, input.userId, encryptField(secret, keyring), input.scopes, expiresAt],
    ),
  );
  return { keyId, secret, deviceId: input.deviceId, scopes: input.scopes, expiresAt };
}

interface ActionKeyRotationRow {
  readonly user_id: string;
  readonly device_id: string;
  readonly scopes: string[];
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

/**
 * Rotates a key when fewer than 7 d remain: issues a fresh key with the same device/scopes and
 * revokes the old one. Returns `undefined` when the key does not exist, is already revoked, or
 * rotation is not yet due — a caller (a later phase's app-foreground check) can call this
 * unconditionally.
 */
export async function rotateActionKeyIfDue(
  pool: pg.Pool,
  keyId: string,
  keyring: FieldEncryptionKeyring,
): Promise<IssuedActionKey | undefined> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<ActionKeyRotationRow>(
      'SELECT user_id, device_id, scopes, expires_at, revoked_at FROM device_action_keys WHERE key_id = $1',
      [keyId],
    ),
  );
  const row = rows[0];
  if (!row || row.revoked_at) return undefined;
  const remainingMs = row.expires_at.getTime() - Date.now();
  if (remainingMs > ROTATE_WHEN_REMAINING_SECONDS * 1000) return undefined;

  const fresh = await issueActionKey(
    pool,
    { userId: row.user_id, deviceId: row.device_id, scopes: row.scopes as ActionKeyScope[] },
    keyring,
  );
  await withSystem(pool, (tx) =>
    tx.query('UPDATE device_action_keys SET revoked_at = now() WHERE key_id = $1', [keyId]),
  );
  return fresh;
}
