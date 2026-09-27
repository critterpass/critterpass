/**
 * Apple ID-token verification (docs/api-contracts.md §5.1 `POST /api/auth/link-social`,
 * `POST /api/auth/sign-in/social`) and SIWA authorization-code capture (docs/data-model.md §3.1
 * "SIWA refresh token captured for revocation"). `buildAppleSocialProviderOptions` produces exactly
 * the `AppleOptions` object Better Auth's `socialProviders.apple` accepts (multi-audience `clientId`,
 * since the app ships both an iOS bundle id and a services id) — Better Auth constructs the real
 * `apple()` provider from it internally, including the id-token verification path
 * (`@better-auth/core`'s `verifyProviderIdToken`: issuer, audience, nonce, expiry all run for real).
 * `clientSecret` is a placeholder: the app only ever uses the id-token sign-in/link path, never
 * Better Auth's own OAuth-redirect/code-exchange flow, so nothing reads it. Tests
 * (services/api/test/auth/link-social.db.test.ts) double only the network boundary — Apple's own
 * `/auth/keys` JWKS endpoint — by stubbing `fetch`, not this configuration.
 */
export interface AppleProviderConfig {
  /** Bundle id(s) Apple issues the ID token's `aud` claim for; an array covers app + services id. */
  readonly clientId: string | readonly string[];
  readonly appBundleIdentifier?: string;
}

interface AppleSocialProviderOptions {
  readonly clientId: string[];
  readonly clientSecret: string;
  readonly appBundleIdentifier?: string;
}

/** A bare string must become a one-element array, not be spread into individual characters. */
function toClientIdArray(clientId: string | readonly string[]): string[] {
  return typeof clientId === 'string' ? [clientId] : clientId.slice();
}

/** Better Auth's `socialProviders.apple` entry — pass straight into `buildAuthOptions`. */
export function buildAppleSocialProviderOptions(
  config: AppleProviderConfig,
): AppleSocialProviderOptions {
  return {
    clientId: toClientIdArray(config.clientId),
    clientSecret: 'unused-id-token-flow-only',
    ...(config.appBundleIdentifier ? { appBundleIdentifier: config.appBundleIdentifier } : {}),
  };
}

export interface AppleClientSecretConfig {
  readonly teamId: string;
  readonly keyId: string;
  readonly clientId: string;
  /** PEM-encoded ES256 private key for the Sign in with Apple service id (Apple Developer portal). */
  readonly privateKeyPem: string;
}

const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_ENDPOINT = 'https://appleid.apple.com/auth/revoke';
/** Apple caps the client secret JWT at 6 months; refreshed well inside that on every mint. */
const CLIENT_SECRET_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Apple's OAuth `client_secret` is a short-lived ES256 JWT signed with the service id's private
 * key (Apple Developer portal), not a static string — minted fresh for each authorization-code
 * exchange / revoke call rather than cached, since it is cheap to sign and this keeps no secret
 * material in memory longer than one request.
 */
export async function generateAppleClientSecret(config: AppleClientSecretConfig): Promise<string> {
  const { SignJWT, importPKCS8 } = await import('jose');
  const key = await importPKCS8(config.privateKeyPem, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + CLIENT_SECRET_TTL_SECONDS)
    .setAudience('https://appleid.apple.com')
    .setSubject(config.clientId)
    .sign(key);
}

export interface AppleHttpClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface ExchangeAppleAuthorizationCodeInput {
  readonly authorizationCode: string;
  readonly redirectUri: string;
}

export interface AppleTokenResponse {
  readonly refresh_token?: string;
  readonly access_token?: string;
}

/** Exchanges a captured SIWA `authorizationCode` for a refresh token (docs/api-contracts.md §5.1 `POST /v1/auth/apple/authorization-code`). */
export async function exchangeAppleAuthorizationCode(
  input: ExchangeAppleAuthorizationCodeInput,
  config: AppleClientSecretConfig,
  http: AppleHttpClient,
): Promise<AppleTokenResponse> {
  const clientSecret = await generateAppleClientSecret(config);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    code: input.authorizationCode,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });
  const response = await http.fetch(APPLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(
      `apple token exchange failed: ${response.status} ${await response.text().catch(() => '')}`,
    );
  }
  return (await response.json()) as AppleTokenResponse;
}

/** Revokes a previously captured Apple refresh token (used on account deletion, phase 45, and unlink). */
export async function revokeAppleToken(
  refreshToken: string,
  config: AppleClientSecretConfig,
  http: AppleHttpClient,
): Promise<void> {
  const clientSecret = await generateAppleClientSecret(config);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  const response = await http.fetch(APPLE_REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(
      `apple token revoke failed: ${response.status} ${await response.text().catch(() => '')}`,
    );
  }
}
