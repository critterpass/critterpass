/**
 * The OAuth side of mailbox connections: config from the environment (client ids and secrets per
 * provider; names only in services/api/.env.example), session-bound `state` in Redis (ten minutes,
 * consumed once by the same user on the same device), the code exchange with its PKCE verifier and
 * the revocation on disconnect. Only the provider's network boundary is behind `fetch`. Tokens leave
 * this module only as the AES-256-GCM envelope; neither they nor codes are ever logged.
 */
import { randomBytes } from 'node:crypto';

import type { crypto as dbCrypto } from '@cp/db';
import { DomainError, MAILBOX_PROVIDERS_SPEC, type MailboxProvider } from '@cp/domain';
import { z } from 'zod';

import type { OAuthStateStore } from '../calendar-oauth/state';

type FieldKeyring = Parameters<typeof dbCrypto.encryptField>[1];

export interface MailboxOAuthConfig {
  readonly providers: Partial<Record<MailboxProvider, { clientId: string; clientSecret: string }>>;
  readonly publicBaseUrl: string;
  readonly appScheme: string;
  readonly keyring: FieldKeyring;
  readonly fetch?: typeof fetch;
}

const APP_SCHEMES = {
  local: 'critterpass-dev',
  staging: 'critterpass-staging',
  production: 'critterpass',
} as const;

export function mailboxOAuthConfigFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  keyring: FieldKeyring | undefined,
): MailboxOAuthConfig | undefined {
  const base = env['PUBLIC_BASE_URL'];
  if (keyring === undefined || base === undefined || base === '') return undefined;
  const pair = (id?: string, secret?: string) =>
    id && secret ? { clientId: id, clientSecret: secret } : undefined;
  const gmail = pair(env['GOOGLE_MAILBOX_CLIENT_ID'], env['GOOGLE_MAILBOX_CLIENT_SECRET']);
  const microsoft = pair(
    env['MICROSOFT_MAILBOX_CLIENT_ID'],
    env['MICROSOFT_MAILBOX_CLIENT_SECRET'],
  );
  const appEnv =
    env['APP_ENV'] === 'production' || env['APP_ENV'] === 'staging' ? env['APP_ENV'] : 'local';
  return {
    providers: { ...(gmail ? { gmail } : {}), ...(microsoft ? { microsoft } : {}) },
    publicBaseUrl: base.replace(/\/$/u, ''),
    appScheme: APP_SCHEMES[appEnv],
    keyring,
  };
}

export function mailboxRedirectUri(config: MailboxOAuthConfig, provider: MailboxProvider): string {
  return `${config.publicBaseUrl}/v1/mailbox/oauth/${provider}/callback`;
}

const stateSchema = z.object({
  uid: z.uuid(),
  device_id: z.string().min(1).max(128),
  provider: z.enum(['gmail', 'microsoft']),
  verifier: z.string().min(43).max(128),
});
type MailboxState = z.infer<typeof stateSchema>;
const stateKey = (state: string) => `mailbox-oauth:${state}`;

export async function createMailboxState(
  store: OAuthStateStore,
  record: MailboxState,
): Promise<string> {
  const state = randomBytes(24).toString('base64url');
  await store.set(stateKey(state), JSON.stringify(record), { EX: 600, NX: true });
  return state;
}

export async function peekMailboxState(
  store: OAuthStateStore,
  state: string,
  provider: MailboxProvider,
): Promise<boolean> {
  const raw = await store.get(stateKey(state));
  const parsed = raw === null ? null : stateSchema.safeParse(JSON.parse(raw));
  return parsed?.success === true && parsed.data.provider === provider;
}

export async function consumeMailboxState(
  store: OAuthStateStore,
  state: string,
  expected: { uid: string; deviceId: string; provider: MailboxProvider },
): Promise<MailboxState> {
  const raw = await store.getDel(stateKey(state));
  if (raw === null) throw new DomainError('STATE_INVALID', { reason: 'oauth_state_expired' });
  const record = stateSchema.parse(JSON.parse(raw));
  if (
    record.uid !== expected.uid ||
    record.device_id !== expected.deviceId ||
    record.provider !== expected.provider
  ) {
    throw new DomainError('FORBIDDEN', { reason: 'oauth_state_mismatch' });
  }
  return record;
}

export function mailboxAuthorizeUrl(
  config: MailboxOAuthConfig,
  provider: MailboxProvider,
  state: string,
  challenge: string,
): string {
  const spec = MAILBOX_PROVIDERS_SPEC[provider];
  const credentials = config.providers[provider];
  if (credentials === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'mailbox_provider_unset', provider });
  }
  const url = new URL(spec.authorizeUrl);
  const params = {
    client_id: credentials.clientId,
    redirect_uri: mailboxRedirectUri(config, provider),
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

async function post(config: MailboxOAuthConfig, url: string, body: Record<string, string>) {
  try {
    return await (config.fetch ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DomainError('UPSTREAM_TIMEOUT', { reason: 'mailbox_provider' });
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

/** Exchanges the code; a grant without a refresh token (no offline access) is refused. */
export async function exchangeMailboxCode(
  config: MailboxOAuthConfig,
  provider: MailboxProvider,
  code: string,
  verifier: string,
): Promise<{ refreshToken: string; scope: string }> {
  const credentials = config.providers[provider];
  if (credentials === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'mailbox_provider_unset', provider });
  }
  const response = await post(config, MAILBOX_PROVIDERS_SPEC[provider].tokenUrl, {
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: mailboxRedirectUri(config, provider),
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  if (response.status >= 500)
    throw new DomainError('SUPPLIER_UNAVAILABLE', { reason: 'mailbox_provider', provider });
  const parsed = tokenSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success || parsed.data.refresh_token === undefined) {
    throw new DomainError('SUPPLIER_REJECTED', { reason: 'code_exchange_failed', provider });
  }
  return {
    refreshToken: parsed.data.refresh_token,
    scope: (parsed.data.scope ?? MAILBOX_PROVIDERS_SPEC[provider].scopes.join(' ')).slice(0, 500),
  };
}

/** Revokes the grant where the provider can (Google); reports whether the provider confirmed it. */
export async function revokeMailbox(
  config: Pick<MailboxOAuthConfig, 'fetch'>,
  provider: MailboxProvider,
  refreshToken: string,
): Promise<boolean> {
  const url = MAILBOX_PROVIDERS_SPEC[provider].revokeUrl;
  if (url === null) return false;
  try {
    return (await post(config as MailboxOAuthConfig, url, { token: refreshToken })).ok;
  } catch {
    return false;
  }
}
