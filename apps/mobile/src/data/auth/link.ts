/**
 * Apple/Google account linking on an anonymous session (docs/api-contracts.md §5.1 `POST
 * /api/auth/link-social`; 3a-7 "Save your pass"). Native ID-token acquisition
 * (`expo-apple-authentication` / Google Sign-In) is injected, not imported directly, so this file's
 * outcome-mapping logic is unit-testable with no native build in this lane (code-standards.md §17,
 * the same convention as apps/mobile/src/lib/attestation.ts).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a provider id, outcome discriminant or error code, never rendered copy. */
import type { LinkOutcome } from './types';

export interface NativeIdTokenResult {
  readonly idToken: string;
  readonly nonce: string;
}

/** The one native call each provider needs: produce a fresh ID token + the nonce it was requested with. `undefined` means the user cancelled the native sheet. */
export interface NativeIdTokenProvider {
  requestIdToken(): Promise<NativeIdTokenResult | undefined>;
}

export interface LinkSocialResponse {
  readonly status?: boolean;
}

/**
 * `@better-fetch/fetch`'s error object is the parsed JSON body spread onto `{status, statusText}`
 * (verified against the installed `@better-fetch/fetch` 1.3.2 source): Better Auth's own native
 * errors arrive flat (`{code, message}`), but `MERGE_REQUIRED` — the one error this endpoint
 * deliberately wraps in this app's own wire envelope (services/api/src/auth/merge/intercept.ts) —
 * arrives nested under `.error` (`{error: {code, message, retryable, detail}}`). Both shapes land on
 * the same object at different depths, so both are checked.
 */
interface LinkSocialErrorShape {
  readonly status?: number;
  readonly code?: string;
  readonly error?: { readonly code?: string; readonly detail?: { readonly ticket?: string } };
}

export interface LinkSocialClient {
  linkSocial(args: {
    provider: 'apple' | 'google';
    idToken: { token: string; nonce: string };
  }): Promise<{ data: LinkSocialResponse | null; error: LinkSocialErrorShape | null }>;
}

async function linkProvider(
  provider: 'apple' | 'google',
  native: NativeIdTokenProvider,
  client: LinkSocialClient,
): Promise<LinkOutcome> {
  const idToken = await native.requestIdToken();
  if (!idToken) return { kind: 'cancelled' };

  const { data, error } = await client.linkSocial({
    provider,
    idToken: { token: idToken.idToken, nonce: idToken.nonce },
  });
  if (!error) {
    return data?.status ? { kind: 'linked' } : { kind: 'error', code: 'UNKNOWN' };
  }
  const wrappedTicket =
    error.error?.code === 'MERGE_REQUIRED' ? error.error.detail?.ticket : undefined;
  if (wrappedTicket) return { kind: 'merge_required', ticket: wrappedTicket };
  if (error.code === 'LINKING_DIFFERENT_EMAILS_NOT_ALLOWED') {
    return { kind: 'different_emails_not_allowed' };
  }
  return { kind: 'error', code: error.code ?? error.error?.code ?? 'UNKNOWN' };
}

export function linkApple(
  native: NativeIdTokenProvider,
  client: LinkSocialClient,
): Promise<LinkOutcome> {
  return linkProvider('apple', native, client);
}

export function linkGoogle(
  native: NativeIdTokenProvider,
  client: LinkSocialClient,
): Promise<LinkOutcome> {
  return linkProvider('google', native, client);
}
