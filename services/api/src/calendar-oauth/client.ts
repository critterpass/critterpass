/**
 * The OAuth side of calendar connections (Google Calendar free/busy, Microsoft Graph calendar
 * view): PKCE S256 challenges, the authorize URL, the code exchange and token revocation. Only the
 * provider's network boundary is behind `fetch`, so tests replay recorded provider responses.
 * Tokens leave this module only as the AES-256-GCM envelope stored in `calendar_sources`; neither
 * they nor the code are ever logged.
 */
import { createHash, randomBytes } from 'node:crypto';

import { crypto as dbCrypto } from '@cp/db';
import { CALENDAR_PROVIDERS, DomainError, type OAuthCalendarProvider } from '@cp/domain';
import { z } from 'zod';

type FieldEncryptionKeyring = Parameters<typeof dbCrypto.encryptField>[1];

export interface ProviderCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

export interface CalendarOAuthConfig {
  /** Credentials per provider; a provider without them cannot be connected. */
  readonly providers: Partial<Record<OAuthCalendarProvider, ProviderCredentials>>;
  /** `https://api.critterpass.app`: the callback is `<base>/v1/calendar/oauth/<provider>/callback`. */
  readonly publicBaseUrl: string;
  /** The app's URL scheme the callback hands the code back to (`critterpass`, `critterpass-dev`). */
  readonly appScheme: string;
  readonly keyring: FieldEncryptionKeyring;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface OAuthTokens {
  readonly access_token: string;
  readonly refresh_token: string | null;
  /** ISO instant the access token stops working. */
  readonly expires_at: string;
  readonly scope: string;
}

export function redirectUri(config: CalendarOAuthConfig, provider: OAuthCalendarProvider): string {
  return `${config.publicBaseUrl.replace(/\/$/u, '')}/v1/calendar/oauth/${provider}/callback`;
}

export function credentialsFor(
  config: CalendarOAuthConfig,
  provider: OAuthCalendarProvider,
): ProviderCredentials {
  const credentials = config.providers[provider];
  if (credentials === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'calendar_provider_unset', provider });
  }
  return credentials;
}

/** A fresh PKCE pair: 43-char verifier, S256 challenge (RFC 7636). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function authorizeUrl(
  config: CalendarOAuthConfig,
  provider: OAuthCalendarProvider,
  state: string,
  challenge: string,
): string {
  const spec = CALENDAR_PROVIDERS[provider];
  const url = new URL(spec.authorizeUrl);
  const params: Record<string, string> = {
    client_id: credentialsFor(config, provider).clientId,
    redirect_uri: redirectUri(config, provider),
    response_type: 'code',
    scope: spec.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...spec.authorizeParams,
  };
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

async function post(
  config: CalendarOAuthConfig,
  url: string,
  body: Readonly<Record<string, string>>,
): Promise<Response> {
  const run = config.fetch ?? fetch;
  try {
    return await run(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
    });
  } catch {
    throw new DomainError('UPSTREAM_TIMEOUT', { reason: 'calendar_provider' });
  }
}

/** Exchanges an authorization code (with its PKCE verifier) for tokens. */
export async function exchangeCode(
  config: CalendarOAuthConfig,
  provider: OAuthCalendarProvider,
  code: string,
  verifier: string,
  now: Date,
): Promise<OAuthTokens> {
  const credentials = credentialsFor(config, provider);
  const response = await post(config, CALENDAR_PROVIDERS[provider].tokenUrl, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(config, provider),
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  if (response.status >= 500) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'calendar_provider', provider });
  }
  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) {
    throw new DomainError('SUPPLIER_REJECTED', { reason: 'code_exchange_failed', provider });
  }
  return {
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token ?? null,
    expires_at: new Date(now.getTime() + parsed.data.expires_in * 1000).toISOString(),
    scope: parsed.data.scope ?? CALENDAR_PROVIDERS[provider].scopes.join(' '),
  };
}

/** Revokes a grant where the provider can (Google); best effort, never blocks a disconnect. */
export async function revokeTokens(
  config: CalendarOAuthConfig,
  provider: OAuthCalendarProvider,
  tokens: OAuthTokens,
): Promise<boolean> {
  const url = CALENDAR_PROVIDERS[provider].revokeUrl;
  if (url === null) return false;
  try {
    const response = await post(config, url, {
      token: tokens.refresh_token ?? tokens.access_token,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function sealTokens(tokens: OAuthTokens, keyring: FieldEncryptionKeyring): string {
  return dbCrypto.encryptField(JSON.stringify(tokens), keyring);
}

export function openTokens(sealed: string, keyring: FieldEncryptionKeyring): OAuthTokens {
  return JSON.parse(dbCrypto.decryptField(sealed, keyring)) as OAuthTokens;
}
