/**
 * HMAC-SHA256 signing and verification for signed media URLs served by the media Worker.
 * Web Crypto only (`crypto.subtle`, `TextEncoder`) so this module behaves identically in Node
 * (services/api) and in Cloudflare Workers (services/media-worker) without any Node built-ins.
 */

export interface SignMediaUrlParams {
  readonly baseUrl: string;
  readonly objectKey: string;
  readonly variant: string;
  readonly expiresAt: number;
  readonly keyId: string;
  readonly secret: string;
}

export interface VerifyMediaSignatureParams {
  readonly objectKey: string;
  readonly variant: string;
  readonly exp: number;
  readonly kid: string;
  readonly sig: string;
  readonly keys: Readonly<Record<string, string>>;
  readonly now: number;
}

export type MediaSignatureResult =
  | { readonly status: 'ok' }
  | { readonly status: 'expired' }
  | { readonly status: 'bad_signature' }
  | { readonly status: 'unknown_key' }
  | { readonly status: 'malformed'; readonly reason: string };

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function signaturePayload(objectKey: string, variant: string, exp: number): string {
  return `${objectKey}|${variant}|${exp}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const binary = atob(normalized + '='.repeat(paddingLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0) throw new Error(`signMediaUrl: ${name} must not be empty`);
}

/**
 * Builds `<baseUrl>/<objectKey>?v=<variant>&exp=<unix seconds>&kid=<keyId>&sig=<base64url>`,
 * where `sig` is HMAC-SHA256(secret, `${objectKey}|${variant}|${exp}`).
 */
export async function signMediaUrl(params: SignMediaUrlParams): Promise<string> {
  const { baseUrl, objectKey, variant, expiresAt, keyId, secret } = params;
  assertNonEmpty(objectKey, 'objectKey');
  assertNonEmpty(variant, 'variant');
  assertNonEmpty(keyId, 'keyId');
  assertNonEmpty(secret, 'secret');
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
    throw new Error('signMediaUrl: expiresAt must be a positive integer (unix seconds)');
  }

  const key = await importHmacKey(secret, 'sign');
  const message = new TextEncoder().encode(signaturePayload(objectKey, variant, expiresAt));
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const sig = base64UrlEncode(signatureBytes);

  const encodedKey = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${encodedKey}`);
  url.searchParams.set('v', variant);
  url.searchParams.set('exp', String(expiresAt));
  url.searchParams.set('kid', keyId);
  url.searchParams.set('sig', sig);
  return url.toString();
}

/**
 * Verifies a media URL's signature against the current time and known signing keys.
 * Never throws: malformed input is reported through the returned result so callers at the
 * network boundary (the media Worker) can map every case to a response without a try/catch.
 */
export async function verifyMediaSignature(
  params: VerifyMediaSignatureParams,
): Promise<MediaSignatureResult> {
  const { objectKey, variant, exp, kid, sig, keys, now } = params;

  if (objectKey.length === 0) return { status: 'malformed', reason: 'missing object key' };
  if (variant.length === 0) return { status: 'malformed', reason: 'missing variant' };
  if (kid.length === 0) return { status: 'malformed', reason: 'missing key id' };
  if (!Number.isInteger(exp) || exp <= 0) {
    return { status: 'malformed', reason: 'exp must be a positive integer' };
  }
  if (sig.length === 0 || !BASE64URL_PATTERN.test(sig)) {
    return { status: 'malformed', reason: 'sig must be base64url' };
  }

  const secret = keys[kid];
  if (secret === undefined) return { status: 'unknown_key' };

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64UrlDecode(sig);
  } catch {
    return { status: 'malformed', reason: 'sig is not valid base64url' };
  }

  const key = await importHmacKey(secret, 'verify');
  const message = new TextEncoder().encode(signaturePayload(objectKey, variant, exp));
  const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, message);
  if (!valid) return { status: 'bad_signature' };

  if (now > exp) return { status: 'expired' };

  return { status: 'ok' };
}
