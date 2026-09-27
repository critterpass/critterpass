import { createHash, createHmac } from 'node:crypto';

/**
 * Device action key request signing (api-contracts-async.md §5): headers `X-CP-Key-Id`,
 * `X-CP-Ts` (±300 s window), `X-CP-Sig = base64url(HMAC-SHA256(secret, method \n path \n ts \n
 * sha256(body)))`. Mirrored byte-for-byte in
 * `apps/mobile/targets/_shared/ActionsClient.swift` — `signature-parity.test.ts` proves the two
 * implementations agree on the same fixed vector.
 */
export interface SignedRequestHeaders {
  keyId: string;
  timestamp: string;
  signature: string;
}

export interface DeviceActionKey {
  keyId: string;
  /** Raw HMAC key bytes. */
  secret: Buffer;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function sign(
  method: string,
  path: string,
  body: Buffer,
  key: DeviceActionKey,
  timestamp = new Date(),
): SignedRequestHeaders {
  const ts = String(Math.floor(timestamp.getTime() / 1000));
  const bodyDigest = createHash('sha256').update(body).digest('hex');
  const toSign = `${method}\n${path}\n${ts}\n${bodyDigest}`;
  const signature = base64Url(createHmac('sha256', key.secret).update(toSign).digest());
  return { keyId: key.keyId, timestamp: ts, signature };
}

export const MAX_CLOCK_SKEW_SECONDS = 300;

export type VerifyResult = { valid: true } | { valid: false; reason: string };

/** What the actions-server (or a real api service) runs on an inbound `/v1/actions` call. */
export function verify(
  method: string,
  path: string,
  body: Buffer,
  headers: SignedRequestHeaders,
  key: DeviceActionKey,
  now = new Date(),
): VerifyResult {
  const tsSeconds = Number(headers.timestamp);
  if (!Number.isFinite(tsSeconds)) return { valid: false, reason: 'malformed timestamp' };
  const skew = Math.abs(Math.floor(now.getTime() / 1000) - tsSeconds);
  if (skew > MAX_CLOCK_SKEW_SECONDS)
    return { valid: false, reason: `timestamp skew ${skew}s exceeds window` };

  const expected = sign(method, path, body, key, new Date(tsSeconds * 1000));
  if (expected.signature !== headers.signature)
    return { valid: false, reason: 'signature mismatch' };
  return { valid: true };
}
