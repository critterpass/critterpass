/**
 * The emergency CLI's owner token (`pnpm --filter @cp/admin admin:cmd`): `<payload>.<sig>`, where the
 * payload is `{email, iat, exp}` and the signature is HMAC-SHA256 under the api's auth secret with
 * its own label, so it can never pass for a session or a media signature. Lives at most 5 minutes;
 * the api still requires the e-mail to be an allow-listed, unbanned `owner` (and the Access
 * assertion where Access is on), and runs the command through the same audited pipeline.
 */
export const ADMIN_CLI_TOKEN_MAX_SECONDS = 300;
const LABEL = 'cp-admin-cli:v1:';

export interface AdminCliClaims {
  readonly email: string;
  readonly iat: number;
  readonly exp: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(LABEL + payload));
  return base64Url(new Uint8Array(signed));
}

export async function mintAdminCliToken(input: {
  email: string;
  secret: string;
  now: Date;
  ttlSeconds?: number;
}): Promise<string> {
  const iat = Math.floor(input.now.getTime() / 1000);
  const ttl = Math.min(
    input.ttlSeconds ?? ADMIN_CLI_TOKEN_MAX_SECONDS,
    ADMIN_CLI_TOKEN_MAX_SECONDS,
  );
  const claims: AdminCliClaims = { email: input.email.toLowerCase(), iat, exp: iat + ttl };
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(claims)));
  return `${payload}.${await signature(input.secret, payload)}`;
}

/** The claims of a genuine, unexpired token, or null. */
export async function verifyAdminCliToken(
  token: string,
  secret: string,
  now: Date,
): Promise<AdminCliClaims | null> {
  const [payload, sig, extra] = token.split('.');
  if (payload === undefined || sig === undefined || extra !== undefined) return null;
  const expected = await signature(secret, payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let index = 0; index < sig.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ sig.charCodeAt(index);
  }
  if (diff !== 0) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as AdminCliClaims;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (typeof claims.email !== 'string' || !Number.isInteger(claims.exp)) return null;
    if (claims.exp <= nowSeconds || claims.exp - claims.iat > ADMIN_CLI_TOKEN_MAX_SECONDS) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
