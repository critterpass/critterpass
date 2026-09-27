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
import { enforceOtpSendRateLimit, type AbuseRateLimitDeps } from '../abuse/rate-limits';

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
}

/**
 * The one `hooks.before` middleware Better Auth accepts (a single function, not an array of matcher
 * rules the way a plugin's own `hooks` are): composes attestation (F-029, `/sign-in/anonymous` +
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
    } catch (error) {
      throw toApiError(error);
    }
  });
}

/** Records pumping bookkeeping after a `/phone-number/send-otp` call that the `before` hook above did not already reject. */
export function buildRequestAfterHook(
  deps: Pick<RequestGuardsDeps, 'pumping'>,
): NonNullable<NonNullable<BetterAuthOptions['hooks']>['after']> {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== SEND_OTP_PATH) return;
    try {
      await recordOtpSendPumpingBookkeeping(readSendOtpPhoneNumber(ctx), deps.pumping);
    } catch (error) {
      throw toApiError(error);
    }
  });
}
