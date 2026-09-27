/**
 * Seat tokens: the optional second segment of an invite link (`/i/{code}/{seat}`) that reserves
 * one named seat. 128 random bits plus a truncated HMAC-SHA256 over the code and those bits, keyed
 * by a rotating key id, so a referrer string or pasted link can be checked without a database
 * round trip and a seat token only ever validates next to the code it was minted for.
 *
 * Layout (no separators, so the token stays one clean path segment):
 * `nonce` (22 base64url chars, 16 bytes) + `mac` (22 chars, first 16 bytes of the HMAC) + `kid`.
 *
 * Web Crypto only, so the same module runs in Node (api) and Cloudflare Workers (web).
 */

const NONCE_BYTES = 16;
const MAC_BYTES = 16;
const ENCODED_16_BYTES = 22;
const KEY_ID_PATTERN = /^[a-z0-9]{1,8}$/;
const SEAT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{44}[a-z0-9]{1,8}$/;

export interface SeatTokenKeyring {
  readonly activeKeyId: string;
  /** Key id → secret; retired keys stay listed until every token signed with them has expired. */
  readonly keys: Readonly<Record<string, string>>;
}

export type SeatTokenCheck =
  | { readonly status: 'ok'; readonly keyId: string }
  | { readonly status: 'malformed' }
  | { readonly status: 'unknown_key' }
  | { readonly status: 'bad_signature' };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function macInput(code: string, nonce: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`seat|v1|${code}|${nonce}`);
}

async function truncatedMac(secret: string, code: string, nonce: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const full = new Uint8Array(await crypto.subtle.sign('HMAC', key, macInput(code, nonce)));
  return base64UrlEncode(full.subarray(0, MAC_BYTES));
}

/** Length-independent comparison of two ASCII strings. */
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Shape check only (no key needed); used by link parsing on every side. */
export function isSeatTokenShape(value: string): boolean {
  return SEAT_TOKEN_PATTERN.test(value);
}

export async function createSeatToken(code: string, keyring: SeatTokenKeyring): Promise<string> {
  const secret = keyring.keys[keyring.activeKeyId];
  if (secret === undefined || !KEY_ID_PATTERN.test(keyring.activeKeyId)) {
    throw new Error('seat token keyring has no usable active key');
  }
  const nonce = base64UrlEncode(crypto.getRandomValues(new Uint8Array(NONCE_BYTES)));
  const mac = await truncatedMac(secret, code, nonce);
  return `${nonce}${mac}${keyring.activeKeyId}`;
}

export async function verifySeatToken(
  token: string,
  code: string,
  keys: Readonly<Record<string, string>>,
): Promise<SeatTokenCheck> {
  if (!isSeatTokenShape(token)) return { status: 'malformed' };
  const nonce = token.slice(0, ENCODED_16_BYTES);
  const mac = token.slice(ENCODED_16_BYTES, ENCODED_16_BYTES * 2);
  const keyId = token.slice(ENCODED_16_BYTES * 2);
  const secret = Object.hasOwn(keys, keyId) ? keys[keyId] : undefined;
  if (secret === undefined) return { status: 'unknown_key' };
  const expected = await truncatedMac(secret, code, nonce);
  return constantTimeEqual(mac, expected) ? { status: 'ok', keyId } : { status: 'bad_signature' };
}

/**
 * Parses the `SEAT_TOKEN_KEYS` JSON (`{"kid": "secret", ...}`) and active key id from env into a
 * keyring, rejecting ids the token layout cannot carry.
 */
export function seatTokenKeyringFromJson(keysJson: string, activeKeyId: string): SeatTokenKeyring {
  const parsed: unknown = JSON.parse(keysJson);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('seat token keys must be a JSON object of key id to secret');
  }
  const keys: Record<string, string> = {};
  for (const [kid, secret] of Object.entries(parsed)) {
    if (!KEY_ID_PATTERN.test(kid) || typeof secret !== 'string' || secret.length < 32) {
      throw new Error('seat token key ids must be 1-8 of [a-z0-9] with secrets of 32+ chars');
    }
    keys[kid] = secret;
  }
  if (keys[activeKeyId] === undefined) throw new Error('active seat token key id is not listed');
  return { activeKeyId, keys };
}
