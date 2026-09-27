/**
 * Better Auth `databaseHooks` (docs/data-model.md §3.1 Requirements table: "database hook in the
 * same tx"). True cross-role transactional atomicity between Better Auth's own `auth.user` insert
 * and this module's `public.users`/`user_settings` insert is not achievable through Better Auth's
 * public hook API: the hook runs as a follow-up call after Better Auth's adapter has already
 * committed the `auth.user` row, over a *different* Postgres role/connection than
 * `packages/db`'s `withSystem`. If this insert fails, `/sign-in/anonymous` (or the phone/social
 * flow that created the user) surfaces an error to the client — which never received a session — so
 * the orphaned `auth.user` row is harmless and inert; it is never referenced by a session a client
 * holds. Documented as a residual risk in this phase's report rather than papered over.
 */
import { createAuthMiddleware } from '@better-auth/core/api';
import { getSessionFromCtx } from 'better-auth/api';
import { APIError, type BetterAuthOptions } from 'better-auth';
import type pg from 'pg';

import { withSystem } from '@cp/db';
import { DomainError } from '@cp/domain';

import { enforceAttestation, type AttestationDeps } from '../abuse/attestation';
import {
  enforceOtpSendPumpingDefences,
  recordOtpSendPumpingBookkeeping,
  type PumpingHookDeps,
} from '../abuse/pumping';
import {
  enforceLinkRateLimit,
  enforceOtpSendRateLimit,
  type AbuseRateLimitDeps,
} from '../abuse/rate-limits';
import { maybeWriteAdminAudit } from './admin';
import { fanOutSessionRevoked } from './guards';

export interface HooksDeps {
  readonly appPool: pg.Pool;
}

interface CreatedUser {
  readonly id: string;
  readonly isAnonymous?: boolean | null;
}

/** Inserts the matching `public.users` (+ default `user_settings`) row for a just-created `auth.user`. */
export function buildUserCreateAfterHook(deps: HooksDeps): (user: CreatedUser) => Promise<void> {
  return async (user) => {
    const status = user.isAnonymous ? 'anonymous' : 'registered';
    await withSystem(deps.appPool, async (tx) => {
      await tx.query(
        `INSERT INTO users (id, status) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, status],
      );
      await tx.query(
        `INSERT INTO user_settings (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      );
    });
  };
}

interface CreatedAccount {
  readonly userId: string;
  readonly providerId: string;
}

interface InternalAdapterUserUpdater {
  updateUser(userId: string, data: Record<string, unknown>): Promise<unknown>;
}

/**
 * Flips `auth.user.isAnonymous` and `public.users.status` to `registered` the instant a social
 * account is linked (docs/data-model.md §3.1 Requirements: "`linkSocial` ... flips `is_anonymous
 * =false`, `users.status='registered'`"). `account.create.after` fires for every provider Better
 * Auth's `account` model supports (`phoneNumber` verification never creates an `auth.account` row,
 * so `providerId` here is always a real social provider), whether the account was linked onto an
 * anonymous session (`/link-social`) or created during `/sign-in/social` (existing-by-email link or
 * brand-new sign-up) — flipping an already-registered user's status again is a harmless no-op.
 * `getInternalAdapter` is a lazy accessor (services/api/src/auth/index.ts's `authRef` pattern):
 * `auth.$context` only resolves once `betterAuth()` has returned, but `databaseHooks` must be built
 * before that call.
 */
export function buildAccountCreateAfterHook(
  deps: HooksDeps & { getInternalAdapter: () => Promise<InternalAdapterUserUpdater> },
): (account: CreatedAccount) => Promise<void> {
  return async (account) => {
    if (account.providerId !== 'apple' && account.providerId !== 'google') return;
    const internalAdapter = await deps.getInternalAdapter();
    await internalAdapter.updateUser(account.userId, { isAnonymous: false });
    await withSystem(deps.appPool, (tx) =>
      tx.query(`UPDATE users SET status = 'registered' WHERE id = $1 AND status = 'anonymous'`, [
        account.userId,
      ]),
    );
  };
}

export function buildDatabaseHooks(
  deps: HooksDeps,
): NonNullable<BetterAuthOptions['databaseHooks']> {
  const onUserCreated = buildUserCreateAfterHook(deps);
  return {
    user: {
      create: {
        after: async (user) => {
          await onUserCreated(user);
        },
      },
    },
  };
}

interface CreatedVerification {
  readonly id: string;
  readonly identifier: string;
}

/**
 * Captures Better Auth's own `auth.verification.id` the instant a phone OTP row is created, keyed
 * by identifier (the phone number) — read back once, synchronously within the same request, by
 * services/api/src/auth/index.ts's `sendOTP` wrapper so the OTP delivery tracker
 * (services/api/src/auth/otp/router.ts) can carry the real verification id rather than inventing
 * one. In-memory only (not Redis): `send-otp`'s `createVerificationValue` → `sendOTP` call happens
 * in one synchronous request, so nothing here needs to survive a process restart.
 */
export function buildVerificationCreateAfterHook(): {
  hook: (verification: CreatedVerification) => void;
  consumePendingVerificationId: (identifier: string) => string | undefined;
} {
  const pendingByIdentifier = new Map<string, string>();
  return {
    hook: (verification) => {
      pendingByIdentifier.set(verification.identifier, verification.id);
    },
    consumePendingVerificationId: (identifier) => {
      const id = pendingByIdentifier.get(identifier);
      pendingByIdentifier.delete(identifier);
      return id;
    },
  };
}

const ATTESTED_PATHS = new Set(['/sign-in/anonymous', '/phone-number/send-otp']);
const SEND_OTP_PATH = '/phone-number/send-otp';
const LINK_SOCIAL_PATH = '/link-social';
const SIGN_OUT_PATH = '/sign-out';

interface SendOtpBody {
  readonly phoneNumber?: unknown;
}

function readSendOtpPhoneNumber(ctx: { body?: unknown }): string | undefined {
  const phoneNumber = (ctx.body as SendOtpBody | undefined)?.phoneNumber;
  return typeof phoneNumber === 'string' && phoneNumber.length > 0 ? phoneNumber : undefined;
}

/**
 * `better-call`'s `APIError` constructor only *types* `status` as one of its named HTTP-status
 * strings (`better-call/dist/error.mjs`'s `statusCodes` map), even though its runtime also accepts a
 * raw number — this is every status a `DomainError` (`packages/domain/src/errors.ts`) can carry.
 */
const HTTP_STATUS_NAMES: Readonly<Record<number, Parameters<typeof APIError.fromStatus>[0]>> = {
  200: 'OK',
  202: 'ACCEPTED',
  401: 'UNAUTHORIZED',
  402: 'PAYMENT_REQUIRED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

/**
 * Better Auth's dispatch (`runBeforeHooks`/`runAfterHooks`, `node_modules/better-auth/dist/api/
 * dispatch.mjs`) only special-cases a thrown `better-call`/`better-auth` `APIError`: anything else a
 * `hooks.before`/`hooks.after` middleware throws propagates as an unhandled exception and becomes a
 * generic 500 "Something went wrong" (confirmed empirically — a plain thrown `DomainError` reached
 * the client as a 500 regardless of its own `.http`/`.code`). Every check this file composes throws
 * `DomainError`; this converts it to the `APIError` shape Better Auth recognises, carrying the exact
 * same `{error: {code, message, retryable, detail}}` body (`APIError`'s `body` is serialised
 * verbatim by `better-call`'s `toResponse`, so the wire contract does not change).
 */
function toApiError(error: unknown): unknown {
  if (error instanceof DomainError) {
    return APIError.fromStatus(
      HTTP_STATUS_NAMES[error.http] ?? 'INTERNAL_SERVER_ERROR',
      error.toResponseBody(),
    );
  }
  return error;
}

export interface RequestGuardsDeps {
  readonly attestation: AttestationDeps;
  readonly rateLimit: AbuseRateLimitDeps;
  readonly pumping: PumpingHookDeps;
  /** Shared by session-revocation fan-out and the admin-audit write — both are plain `app_system` inserts against the same pool. */
  readonly appPool: pg.Pool;
}

const SESSION_REVOCATION_PATHS = new Set([
  '/sign-out',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
]);

/**
 * The one `hooks.before` middleware Better Auth accepts (a single function, not an array of matcher
 * rules the way a plugin's own `hooks` are): composes attestation (`/sign-in/anonymous` +
 * `/phone-number/send-otp`), then the phone/device rate limits and country/velocity pumping
 * defences (both `/phone-number/send-otp` only — the IP dimension is Better Auth's own `customRules`
 * entry for the same path). Mode/limits live entirely in each module's own config, never in the
 * request, so a client cannot opt itself out of any of them.
 */
export function buildRequestBeforeHook(
  deps: RequestGuardsDeps,
): NonNullable<NonNullable<BetterAuthOptions['hooks']>['before']> {
  return createAuthMiddleware(async (ctx) => {
    try {
      if (ATTESTED_PATHS.has(ctx.path)) {
        await enforceAttestation(ctx.headers ?? new Headers(), deps.attestation);
      }
      if (ctx.path === SEND_OTP_PATH) {
        const phoneNumber = readSendOtpPhoneNumber(ctx);
        const installId = ctx.headers?.get('x-cp-install-id') ?? undefined;
        await enforceOtpSendRateLimit({ phoneNumber, installId }, deps.rateLimit);
        await enforceOtpSendPumpingDefences(phoneNumber, deps.pumping);
      }
      if (ctx.path === SIGN_OUT_PATH) {
        // Better Auth's /sign-out reads the cookie itself and never loads `ctx.context.session`, so
        // the after hook would see no session to fan out for. Load it now, while the row still
        // exists; `disableRefresh` keeps this lookup from issuing a refreshed cookie on sign-out.
        await getSessionFromCtx(ctx, { disableRefresh: true });
      }
      if (ctx.path === LINK_SOCIAL_PATH) {
        // Linking needs a session; without one Better Auth's own handler rejects the call, so there
        // is no uid to count against here.
        const session = await getSessionFromCtx(ctx);
        if (session) await enforceLinkRateLimit(session.user.id, deps.rateLimit);
      }
    } catch (error) {
      throw toApiError(error);
    }
  });
}

/**
 * Records pumping bookkeeping after a `/phone-number/send-otp` call that the `before` hook above did
 * not already reject, and fans out session revocation (`rt_outbox` `session.revoked` + action-key
 * revocation, guards.ts) after `/sign-out`/`/revoke-session(s)` — Better Auth's own handler has
 * already deleted the session row by the time this runs; `ctx.context.session` still carries the
 * pre-deletion session, loaded by Better Auth's `sessionMiddleware` for the revoke endpoints and by
 * the `before` hook above for `/sign-out` (whose handler skips that middleware).
 */
export function buildRequestAfterHook(
  deps: Pick<RequestGuardsDeps, 'pumping' | 'appPool'>,
): NonNullable<NonNullable<BetterAuthOptions['hooks']>['after']> {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path === SEND_OTP_PATH) {
      try {
        await recordOtpSendPumpingBookkeeping(readSendOtpPhoneNumber(ctx), deps.pumping);
      } catch (error) {
        throw toApiError(error);
      }
    }
    if (SESSION_REVOCATION_PATHS.has(ctx.path)) {
      const userId = (ctx.context as { session?: { user: { id: string } } | null }).session?.user
        .id;
      if (userId) await fanOutSessionRevoked(deps.appPool, userId);
    }
    await maybeWriteAdminAudit(ctx, deps.appPool);
  });
}
