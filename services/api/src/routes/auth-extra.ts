/**
 * Auth routes that are not Better Auth endpoints (docs/api-contracts.md §5.1): the attestation
 * challenge, SIWA authorization-code capture, and (added by later tasks in this same file)
 * `/v1/auth/merge-ticket` / `/v1/auth/merge`.
 */
import { z } from 'zod';
import type { Context, Hono } from 'hono';
import type pg from 'pg';

import { crypto as dbCrypto } from '@cp/db';
import { DomainError, type ErrorResponseBody } from '@cp/domain';

import { issueChallenge, type ChallengeRedisClient } from '../abuse/attestation';
import {
  isLockedOut,
  recordCodeAttemptFailure,
  recordCodeAttemptSuccess,
  type CodeAttemptsRedisClient,
} from '../abuse/code-attempts';
import type { AuthInstance } from '../auth/config';
import {
  buildMergePreview,
  executeMerge,
  sessionMatchesTicket,
  signBetterAuthSessionCookie,
  type MergePreview,
} from '../auth/merge/execute';
import {
  consumeMergeTicket,
  verifyMergeTicket,
  type MergeTicketRedisClient,
} from '../auth/merge/ticket';
import {
  exchangeAppleAuthorizationCode,
  type AppleClientSecretConfig,
  type AppleHttpClient,
} from '../auth/social/apple';

const { encryptField } = dbCrypto;
type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

export interface AuthExtraDeps {
  readonly redis: ChallengeRedisClient;
}

const challengeBodySchema = z.object({
  installId: z.uuid(),
});

/** Matches services/api/src/auth/config.ts's session.expiresIn (Better Auth's own 30-day sliding session). */
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function errorResponse(c: Context, error: DomainError) {
  const body: ErrorResponseBody = error.toResponseBody();
  return c.json(body, error.http as never);
}

/** Sets the same `better-auth.session_token` cookie a real sign-in response would, so a web/browser caller (and manual testing) works immediately without depending on the Expo client's own token persistence. */
function setSessionCookieHeader(c: Context, token: string, secret: string): void {
  const signedCookie = encodeURIComponent(signBetterAuthSessionCookie(token, secret));
  c.header(
    'set-cookie',
    `better-auth.session_token=${signedCookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS_SECONDS}`,
  );
}

export function registerAuthExtraRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  deps: AuthExtraDeps,
): void {
  app.post('/v1/attest/challenge', async (c) => {
    const parsed = challengeBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      const error = new DomainError('VALIDATION', { issues: parsed.error.issues });
      const body: ErrorResponseBody = error.toResponseBody();
      return c.json(body, 422);
    }
    const { challenge } = await issueChallenge(deps.redis, parsed.data.installId);
    return c.json({ challenge });
  });
}

export interface AppleAuthorizationCodeDeps {
  readonly auth: AuthInstance;
  readonly clientSecretConfig: AppleClientSecretConfig;
  readonly redirectUri: string;
  readonly http: AppleHttpClient;
  readonly keyring: FieldEncryptionKeyring;
}

interface InternalAdapterAccount {
  readonly id: string;
  readonly providerId: string;
}

interface InternalAdapterLike {
  findAccountByUserId(userId: string): Promise<InternalAdapterAccount[]>;
  updateAccount(id: string, data: Record<string, unknown>): Promise<unknown>;
}

const authorizationCodeBodySchema = z.object({
  authorizationCode: z.string().min(1),
});

/**
 * `POST /v1/auth/apple/authorization-code` (docs/data-model.md §3.1): captures the one-time SIWA
 * `authorizationCode` the client got alongside its ID token, exchanges it for a refresh token, and
 * stores it AES-256-GCM encrypted on the caller's own `auth.account` row (`revokeApple`,
 * services/api/src/auth/social/revoke.ts, reads it back later for deletion/unlink). Requires an
 * authenticated session that already linked Apple (`link-social`/`sign-in/social` runs first) — the
 * authorization code alone proves nothing about which uid it belongs to.
 */
export function registerAppleAuthorizationCodeRoute<E extends { Variables: object }>(
  app: Hono<E>,
  deps: AppleAuthorizationCodeDeps,
): void {
  app.post('/v1/auth/apple/authorization-code', async (c) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return errorResponse(c, new DomainError('AUTH_REQUIRED'));

    const parsed = authorizationCodeBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return errorResponse(c, new DomainError('VALIDATION', { issues: parsed.error.issues }));
    }

    const context = (await deps.auth.$context) as unknown as {
      internalAdapter: InternalAdapterLike;
    };
    const accounts = await context.internalAdapter.findAccountByUserId(session.user.id);
    const appleAccount = accounts.find((account) => account.providerId === 'apple');
    if (!appleAccount) {
      return errorResponse(
        c,
        new DomainError('VALIDATION', { reason: 'no linked apple account for this session' }),
      );
    }

    const tokens = await exchangeAppleAuthorizationCode(
      { authorizationCode: parsed.data.authorizationCode, redirectUri: deps.redirectUri },
      deps.clientSecretConfig,
      deps.http,
    );
    if (!tokens.refresh_token) {
      return errorResponse(
        c,
        new DomainError('VALIDATION', { reason: 'apple returned no refresh token' }),
      );
    }

    await context.internalAdapter.updateAccount(appleAccount.id, {
      refreshToken: encryptField(tokens.refresh_token, deps.keyring),
    });
    return c.json({ captured: true });
  });
}

export interface MergeRoutesDeps {
  readonly auth: AuthInstance;
  readonly appPool: pg.Pool;
  readonly redis: MergeTicketRedisClient;
  readonly secret: string;
}

const mergeTicketBodySchema = z.object({ ticket: z.string().min(1) });
const mergeBodySchema = z.object({
  ticket: z.string().min(1),
  strategy: z.literal('keep_existing'),
});

/**
 * Resolves + validates a ticket against the caller's own session (docs/data-model.md §3.1: "preview
 * route requires the ticket + the same anonymous session"). Returns a `DomainError` to send back
 * verbatim on any failure — signature, expiry, or session mismatch are all reported the same way
 * (`MERGE_REQUIRED`-adjacent `VALIDATION`/`403`), so a forged or stolen ticket never distinguishes
 * which check it failed on ("no preview data leaked").
 */
async function resolveTicketForCaller(
  c: Context,
  deps: Pick<MergeRoutesDeps, 'auth' | 'secret'>,
  ticket: string,
) {
  const payload = verifyMergeTicket(ticket, deps.secret);
  if (!payload)
    return { error: new DomainError('FORBIDDEN', { reason: 'invalid or expired ticket' }) };

  const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
  if (
    !session ||
    session.user.id !== payload.anonUid ||
    !sessionMatchesTicket(session.session.id, payload.anonSessionId)
  ) {
    return {
      error: new DomainError('FORBIDDEN', { reason: 'ticket does not match this session' }),
    };
  }
  return { payload };
}

/** `POST /v1/auth/merge-ticket {ticket}` → `{crews, trips, critters, stamps}` (docs/api-contracts.md §5.1). Never consumes the ticket: repeatable while the user reviews the preview. */
export function registerMergeTicketPreviewRoute<E extends { Variables: object }>(
  app: Hono<E>,
  deps: Pick<MergeRoutesDeps, 'auth' | 'appPool' | 'secret'>,
): void {
  app.post('/v1/auth/merge-ticket', async (c) => {
    const parsed = mergeTicketBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return errorResponse(c, new DomainError('VALIDATION', { issues: parsed.error.issues }));
    }
    const resolved = await resolveTicketForCaller(c, deps, parsed.data.ticket);
    if (resolved.error) return errorResponse(c, resolved.error);

    const preview: MergePreview = await buildMergePreview(
      deps.appPool,
      resolved.payload.anonUid,
      resolved.payload.existingUid,
    );
    return c.json(preview);
  });
}

/** `POST /v1/auth/merge {ticket, strategy: 'keep_existing'}` (docs/api-contracts.md §5.1): single-use, atomic, returns a working session for the existing uid. */
export function registerMergeExecuteRoute<E extends { Variables: object }>(
  app: Hono<E>,
  deps: MergeRoutesDeps,
): void {
  app.post('/v1/auth/merge', async (c) => {
    const parsed = mergeBodySchema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) {
      return errorResponse(c, new DomainError('VALIDATION', { issues: parsed.error.issues }));
    }
    const resolved = await resolveTicketForCaller(c, deps, parsed.data.ticket);
    if (resolved.error) return errorResponse(c, resolved.error);
    const { payload } = resolved;

    const consumed = await consumeMergeTicket(deps.redis, payload);
    if (!consumed) {
      return errorResponse(c, new DomainError('FORBIDDEN', { reason: 'ticket already used' }));
    }

    const result = await executeMerge(payload.anonUid, payload.existingUid, {
      appPool: deps.appPool,
      auth: deps.auth,
    });
    // The raw token is also returned in the body for the Expo client (apps/mobile/src/data/auth/),
    // which persists tokens itself rather than relying on a cookie jar.
    setSessionCookieHeader(c, result.sessionToken, deps.secret);
    return c.json({ token: result.sessionToken, user: { id: result.existingUid } });
  });
}

export interface ReturningPhoneSignInDeps {
  readonly auth: AuthInstance;
  readonly redis: CodeAttemptsRedisClient;
  readonly secret: string;
}

interface InternalAdapterReturningSignIn {
  createSession(userId: string): Promise<{ token: string }>;
}

interface RawAdapterReturningSignIn {
  findOne(query: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }): Promise<{ id: string; phoneNumberVerified?: boolean | null } | null>;
}

/**
 * `consumePhoneNumberOTP` is a `phoneNumber`-plugin endpoint registered with no path
 * (`HIDE_METADATA`, `better-auth` 1.7.6 source): callable only server-side via `auth.api`, never over
 * HTTP. It runs the exact same attempt-tracked verify-and-consume logic
 * `/phone-number/verify`/`/sign-in/phone-number` use internally (5 attempts per code,
 * `packages/db/src/schema/auth.ts`'s `auth.verification` row), without requiring or creating a
 * session — precisely the primitive this route needs.
 */
interface ConsumePhoneNumberOtpApi {
  consumePhoneNumberOTP(args: {
    body: { phoneNumber: string; code: string };
  }): Promise<{ status: true }>;
}

const returningPhoneSignInBodySchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().min(1),
});

/**
 * `POST /api/auth/sign-in/phone-number` (docs/api-contracts.md §5.1): the undesigned returning-user
 * flow — a fresh install, no local pass, "I have an account" splash entry (its UI is built on top of
 * the mobile auth client, apps/mobile/src/data/auth/). Registered before the
 * `/api/auth/*` passthrough to `auth.handler` (same convention as services/api/src/auth/tokens.ts's
 * token/jwks routes) so it wins over Better Auth's own built-in `/sign-in/phone-number` endpoint,
 * which is password-based and unusable for this app's OTP-only design. Reuses
 * `/phone-number/send-otp` (already session-optional) for the code. `code-attempts.ts` adds a second,
 * IP+phone-dimensioned enumeration lockout on top of the per-code attempt cap above (defends against
 * cycling through many different phone numbers from one IP, which the per-code cap alone would not).
 */
export function registerReturningPhoneSignInRoute<E extends { Variables: object }>(
  app: Hono<E>,
  deps: ReturningPhoneSignInDeps,
): void {
  app.post('/api/auth/sign-in/phone-number', async (c) => {
    const parsed = returningPhoneSignInBodySchema.safeParse(
      await c.req.json().catch(() => undefined),
    );
    if (!parsed.success) {
      return errorResponse(c, new DomainError('VALIDATION', { issues: parsed.error.issues }));
    }
    const { phoneNumber, code } = parsed.data;
    const identity = { ip: c.req.header('x-real-ip') ?? 'unknown', uid: phoneNumber };

    const lockout = await isLockedOut(deps.redis, identity);
    if (lockout.locked) {
      return errorResponse(
        c,
        new DomainError('RATE_LIMITED', { retry_after_s: lockout.retryAfterS }),
      );
    }

    const otpApi = deps.auth.api as unknown as ConsumePhoneNumberOtpApi;
    try {
      await otpApi.consumePhoneNumberOTP({ body: { phoneNumber, code } });
    } catch (error) {
      const errorCode = (error as { body?: { code?: string } } | undefined)?.body?.code;
      if (errorCode === 'TOO_MANY_ATTEMPTS') {
        return errorResponse(c, new DomainError('RATE_LIMITED', { reason: 'too_many_attempts' }));
      }
      const status = await recordCodeAttemptFailure(deps.redis, identity);
      return errorResponse(
        c,
        status.locked
          ? new DomainError('RATE_LIMITED', { retry_after_s: status.retryAfterS })
          : new DomainError('VALIDATION', { reason: 'invalid_or_expired_code' }),
      );
    }
    await recordCodeAttemptSuccess(deps.redis, identity);

    const context = (await deps.auth.$context) as unknown as {
      internalAdapter: InternalAdapterReturningSignIn;
      adapter: RawAdapterReturningSignIn;
    };
    const user = await context.adapter.findOne({
      model: 'user',
      where: [{ field: 'phoneNumber', value: phoneNumber }],
    });
    if (!user?.phoneNumberVerified) {
      return errorResponse(
        c,
        new DomainError('NOT_FOUND', { reason: 'no_account_for_phone_number' }),
      );
    }

    const session = await context.internalAdapter.createSession(user.id);
    setSessionCookieHeader(c, session.token, deps.secret);
    return c.json({ token: session.token, user: { id: user.id } });
  });
}
