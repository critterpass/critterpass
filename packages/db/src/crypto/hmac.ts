/**
 * HMAC-SHA256 peppered hashing for lookup columns that must never store plaintext but still need
 * equality search (docs/data-model.md §3.1 `user_private.phone_hash`) — one-way, so `MERGE_REQUIRED`
 * conflict detection matches by hash, never by decrypting every row to compare. Also backs the
 * constant-time comparisons request-signature verification needs (device action keys).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function hashWithPepper(value: string, pepper: string): string {
  return createHmac('sha256', pepper).update(value).digest('hex');
}

/** Constant-time comparison of two hex-encoded hashes; unequal lengths are `false`, never thrown. */
export function hashesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Constant-time comparison of two base64url-encoded values (device action key request signatures). */
export function base64UrlValuesMatch(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'base64url');
  const bufferB = Buffer.from(b, 'base64url');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
