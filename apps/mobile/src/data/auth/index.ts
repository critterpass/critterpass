/**
 * Public surface of the mobile auth data layer (docs/api-contracts.md §5.1; this phase's Architecture
 * table). Every flow function in this directory takes a narrow client interface and is unit-tested
 * against a fake one; this file is the one place that adapts the real `MobileAuthClient`
 * (./client.ts) to each of those narrow shapes, so the adaptation itself stays in one small,
 * low-risk spot instead of duplicated per call site.
 */
/* eslint-disable lingui/no-unlocalized-strings -- this directory is the same non-UI data-access
   layer docs/system-architecture.md §3 describes (PowerSync/command/Centrifugo clients, query
   hooks): every string literal here is a wire protocol value, outcome discriminant or developer-
   facing Error message, never rendered copy (same reasoning as this repo's existing
   apps/mobile/src/lib exemption in eslint.config.js). */
import type { MobileAuthClient } from './client';
import { linkApple, linkGoogle, type LinkSocialClient, type NativeIdTokenProvider } from './link';
import { confirmMerge, startMerge } from './merge';
import { sendOtp, verifyOtp, type SendOtpClient, type VerifyOtpClient } from './otp';
import {
  decideReturningFlow,
  signInReturningPhone,
  type LocalAnonymousDataPresence,
} from './returning';
import { reportAuthFailureToSentry, reportingFailures, type AuthFailureReporter } from './report';
import { ensureAnonymous, type AnonymousSessionClient } from './session';
import { signOut, type SignOutClient } from './sign-out';
import { createTokenCache, type TokenAudience } from './tokens';
import type { MergePreviewSummary } from './types';

/** Better Auth's base path: the client prefixes it to every relative `$fetch` path. */
const AUTH_BASE_PATH = '/api/auth';

/**
 * Where `client.$fetch` sends one of the api's own auth routes (services/api/src/routes/auth-extra.ts).
 * The client prefixes Better Auth's base path to relative paths, so routes mounted under it
 * (`/api/auth/sign-in/phone-number`, `/api/auth/token`) go relative to it, and the routes beside it
 * (`/v1/auth/merge*`) go as absolute URLs, which the client passes through unchanged.
 */
export function authRouteUrl(apiBaseUrl: string, path: string): string {
  return path.startsWith(`${AUTH_BASE_PATH}/`)
    ? path.slice(AUTH_BASE_PATH.length)
    : new URL(path, apiBaseUrl).href;
}

/**
 * Generic `POST` adapter for the custom, non-Better-Auth-generated routes: `client.$fetch` already
 * carries the Expo client's cookie storage/injection, so these go through it too rather than a
 * bare `fetch`.
 */
function postJson<T>(client: MobileAuthClient, url: string, body: unknown) {
  return client.$fetch(url, { method: 'POST', body }) as unknown as Promise<{
    data: T | null;
    error: { status?: number; code?: string; detail?: { retry_after_s?: number } } | null;
  }>;
}

export interface AuthDataLayerOptions {
  /** The api origin the client was created for; the merge routes live beside Better Auth's. */
  readonly apiBaseUrl: string;
  /** Where failed flows report their error code; Sentry on device. */
  readonly reportFailure?: AuthFailureReporter;
}

/** A JWT's `exp` in milliseconds; `atob` because React Native has no `Buffer`. */
export function jwtExpiresAtMs(token: string): number {
  const segment = (token.split('.')[1] ?? '').replace(/-/gu, '+').replace(/_/gu, '/');
  const payload = JSON.parse(atob(segment.padEnd(Math.ceil(segment.length / 4) * 4, '='))) as {
    exp?: number;
  };
  return (payload.exp ?? 0) * 1000;
}

export function createAuthDataLayer(client: MobileAuthClient, options: AuthDataLayerOptions) {
  const report = options.reportFailure ?? reportAuthFailureToSentry;
  const route = (path: string) => authRouteUrl(options.apiBaseUrl, path);
  const tokens = createTokenCache({
    getToken: async (aud: TokenAudience) => {
      const response = await client.$fetch<{ token: string }>(
        route(`${AUTH_BASE_PATH}/token?aud=${aud}`),
      );
      if (response.error || !response.data) {
        const status = response.error?.status ?? 'UNKNOWN';
        throw new Error(`failed to mint a ${aud} token: ${status}`);
      }
      const { token } = response.data;
      return { token, expiresAtMs: jwtExpiresAtMs(token) };
    },
  });

  const anonymousSessionClient: AnonymousSessionClient = {
    getSession: () => client.getSession(),
    signInAnonymous: () =>
      client.signIn.anonymous() as unknown as ReturnType<AnonymousSessionClient['signInAnonymous']>,
  };
  const linkSocialClient: LinkSocialClient = {
    linkSocial: (args) =>
      client.linkSocial(args) as unknown as ReturnType<LinkSocialClient['linkSocial']>,
  };
  const sendOtpClient: SendOtpClient = {
    sendOtp: (args) =>
      client.phoneNumber.sendOtp(args) as unknown as ReturnType<SendOtpClient['sendOtp']>,
  };
  const verifyOtpClient: VerifyOtpClient = {
    verify: (args) =>
      client.phoneNumber.verify(args) as unknown as ReturnType<VerifyOtpClient['verify']>,
  };
  const signOutClient: SignOutClient = {
    signOut: () => client.signOut() as unknown as ReturnType<SignOutClient['signOut']>,
  };

  return {
    ensureAnonymous: () => ensureAnonymous(anonymousSessionClient),
    linkApple: (native: NativeIdTokenProvider) =>
      reportingFailures('link_apple', report, () => linkApple(native, linkSocialClient)),
    linkGoogle: (native: NativeIdTokenProvider) =>
      reportingFailures('link_google', report, () => linkGoogle(native, linkSocialClient)),
    sendOtp: (phoneNumber: string) =>
      reportingFailures('send_otp', report, () => sendOtp(phoneNumber, sendOtpClient)),
    verifyOtp: (input: { phoneNumber: string; code: string }) =>
      reportingFailures('verify_otp', report, () => verifyOtp(input, verifyOtpClient)),
    decideReturningFlow: (local: LocalAnonymousDataPresence) => decideReturningFlow(local),
    signInReturningPhone: (input: { phoneNumber: string; code: string }) =>
      reportingFailures('returning_phone', report, () =>
        signInReturningPhone(input, {
          post: (path, body) => postJson<{ user: { id: string } }>(client, route(path), body),
        }),
      ),
    startMerge: (ticket: string) =>
      reportingFailures('merge_start', report, () =>
        startMerge(ticket, {
          post: (path, body) => postJson<MergePreviewSummary>(client, route(path), body),
        }),
      ),
    confirmMerge: (ticket: string) =>
      reportingFailures('merge_confirm', report, () =>
        confirmMerge(ticket, {
          post: (path, body) => postJson<{ user: { id: string } }>(client, route(path), body),
        }),
      ),
    signOut: () => signOut(signOutClient),
    getSyncToken: () => tokens.getToken('sync'),
    getRealtimeToken: () => tokens.getToken('rt'),
    invalidateTokens: () => tokens.invalidate(),
  };
}

export type AuthDataLayer = ReturnType<typeof createAuthDataLayer>;

export { createMobileAuthClient, type MobileAuthClient } from './client';
export type { AuthFailure, AuthFailureReporter, AuthFlow } from './report';
export type { NativeIdTokenProvider, NativeIdTokenResult } from './link';
export type { LocalAnonymousDataPresence, ReturningFlowDecision } from './returning';
export {
  registerOnSignOut,
  resetOnSignOutHooksForTests,
  runOnSignOutHooks,
} from './sign-out-hooks';
export * from './types';
