/**
 * Device action key request verification (docs/api-contracts-async.md §5): `X-CP-Key-Id`, `X-CP-Ts`
 * (±300 s), `X-CP-Sig = base64url(HMAC-SHA256(secret, method\npath\nts\nsha256(body)))`. The one
 * error code for every rejection reason is `ACTION_KEY_SCOPE` (docs/api-contracts.md §3 has no
 * separate code per failure kind); `detail.reason` distinguishes them for logging/debugging without
 * needing new wire-level codes. Phase 11 wires this into `/v1/actions` and its Swift/Kotlin signer
 * counterpart; this module only proves a request's signature, freshness and scope.
 */
import { createHash, createHmac } from 'node:crypto';

import { crypto as dbCrypto, withSystem } from '@cp/db';
import { DomainError } from '@cp/domain';
import type pg from 'pg';

const { base64UrlValuesMatch, decryptField } = dbCrypto;
type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

const TIMESTAMP_TOLERANCE_SECONDS = 300;

export interface VerifyActionKeyDeps {
  readonly appPool: pg.Pool;
  readonly keyring: FieldEncryptionKeyring;
  /** Test-only clock override; defaults to `Date.now`. */
  readonly now?: () => number;
}

export interface ActionKeyRequestInput {
  readonly method: string;
  readonly path: string;
  readonly headers: Headers;
  readonly body: string;
}

export interface VerifiedActionKey {
  readonly keyId: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly scopes: readonly string[];
}

interface ActionKeyRow {
  readonly user_id: string;
  readonly device_id: string;
  readonly secret_enc: string;
  readonly scopes: string[];
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

function actionKeyScopeError(reason: string): DomainError {
  return new DomainError('ACTION_KEY_SCOPE', { reason });
}

async function loadActionKey(pool: pg.Pool, keyId: string): Promise<ActionKeyRow | undefined> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<ActionKeyRow>(
      'SELECT user_id, device_id, secret_enc, scopes, expires_at, revoked_at FROM device_action_keys WHERE key_id = $1',
      [keyId],
    ),
  );
  return rows[0];
}

async function touchLastUsed(pool: pg.Pool, keyId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query('UPDATE device_action_keys SET last_used_at = now() WHERE key_id = $1', [keyId]),
  );
}

/**
 * Verifies one signed request and enforces `requiredScope`; throws `DomainError('ACTION_KEY_SCOPE')`
 * on any failure (missing headers, stale/future timestamp, unknown/revoked/expired key, missing
 * scope, or a bad signature — including a tampered body, since the signature covers its hash).
 */
export async function verifyActionKeyRequest(
  input: ActionKeyRequestInput,
  requiredScope: string,
  deps: VerifyActionKeyDeps,
): Promise<VerifiedActionKey> {
  const keyId = input.headers.get('x-cp-key-id');
  const ts = input.headers.get('x-cp-ts');
  const signature = input.headers.get('x-cp-sig');
  if (!keyId || !ts || !signature) throw actionKeyScopeError('missing_headers');

  const nowSeconds = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const tsSeconds = Number(ts);
  if (
    !Number.isFinite(tsSeconds) ||
    Math.abs(nowSeconds - tsSeconds) > TIMESTAMP_TOLERANCE_SECONDS
  ) {
    throw actionKeyScopeError('stale_timestamp');
  }

  const row = await loadActionKey(deps.appPool, keyId);
  if (!row || row.revoked_at || row.expires_at.getTime() < Date.now()) {
    throw actionKeyScopeError('revoked_or_expired');
  }
  if (!row.scopes.includes(requiredScope)) throw actionKeyScopeError('missing_scope');

  const secret = decryptField(row.secret_enc, deps.keyring);
  const bodyHash = createHash('sha256').update(input.body).digest('hex');
  const message = `${input.method}\n${input.path}\n${ts}\n${bodyHash}`;
  const expectedSignature = createHmac('sha256', secret).update(message).digest('base64url');
  if (!base64UrlValuesMatch(expectedSignature, signature)) {
    throw actionKeyScopeError('bad_signature');
  }

  await touchLastUsed(deps.appPool, keyId);
  return { keyId, userId: row.user_id, deviceId: row.device_id, scopes: row.scopes };
}
