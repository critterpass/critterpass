/**
 * Assembles Better Auth from injected infrastructure (a dedicated `auth`-role Postgres pool, the
 * app's own pool for the `public.users` hook, Redis). `services/api/src/app.ts` builds the concrete
 * dependency graph (real OTP adapters, real Redis) and receives back a thin `{handler, close}`
 * surface to mount; `services/api/test/auth/*.db.test.ts` builds the same module directly against
 * Testcontainers with fake OTP/attestation ports at the network boundary.
 */
import { watchPoolErrors, type KillSwitchReader } from '@cp/db';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import {
  buildAuthOptions,
  type AuthConfigDeps,
  type AuthSecondaryStorage,
  type PhoneOtpPort,
} from './config';
import {
  buildAccountCreateAfterHook,
  buildDatabaseHooks,
  buildRequestAfterHook,
  buildRequestBeforeHook,
  buildVerificationCreateAfterHook,
  toApiError,
} from './hooks';
import {
  createOtpRouter,
  createRedisOtpDeliveryTracker,
  type OtpChannelAdapter,
} from './otp/router';
import type { OtpChannel } from './otp/countries';
import {
  maskedNumber,
  useFixedCode,
  withTestNumberRecycling,
  type FixedCodeKind,
  type FixedCodeNumbers,
} from './otp/fixed-codes';
import { betterAuth } from 'better-auth';

import type { AttestationConfig, AttestationDeps } from '../abuse/attestation';
import { defaultPumpingConfig, type PumpingConfig } from '../abuse/pumping';
import { createKillSwitches } from '../ops/kill-switches';
import { wrapHandlerWithMergeIntercept } from './merge/intercept';
import type { AppleProviderConfig } from './social/apple';
import type { GoogleProviderConfig } from './social/google';

/** The subset of node-redis's client API this module needs; real shape (not `AuthSecondaryStorage`'s simplified one) so `services/api/src/app.ts` can pass its actual `redis` client through untouched. */
export interface AuthRedisClient {
  get(key: string): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  incrBy(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
}

export interface AuthModuleDeps {
  readonly appPool: pg.Pool;
  readonly authDatabaseUrl: string;
  /** Better Auth's pool size (default 5). */
  readonly authPoolMax?: number;
  readonly redis: AuthRedisClient;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly otpAdapters: Partial<Record<OtpChannel, OtpChannelAdapter>>;
  /** Test and App Review numbers that sign in with a fixed code and are never sent one. */
  readonly fixedCodes?: FixedCodeNumbers | undefined;
  /** Told about every fixed-code sign-in attempt (the api logs it). */
  readonly onFixedCode?: ((use: { kind: FixedCodeKind; number: string }) => void) | undefined;
  readonly jwksRotationIntervalSeconds?: number | undefined;
  readonly rateLimit?: AuthConfigDeps['rateLimit'];
  readonly attestation: AttestationConfig;
  readonly onAttestationFailure?: AttestationDeps['onAttestationFailure'];
  readonly onAttestationVerified?: AttestationDeps['onAttestationVerified'];
  /** Defaults to `defaultPumpingConfig()`; override to set real allow-listed countries and spend caps once provisioned. */
  readonly pumping?: PumpingConfig | undefined;
  /** Absent when Apple Developer credentials are not provisioned yet (non-code dependency table). */
  readonly apple?: AppleProviderConfig | undefined;
  /** Absent when Google Cloud OAuth client ids are not provisioned yet. */
  readonly google?: GoogleProviderConfig | undefined;
  /** Gates admin impersonation (admin.ts); defaults to `true` (fail safe). */
  readonly isProduction?: boolean | undefined;
  /** The ops kill switches (`signup.enabled`, `otp.<channel>.enabled`); defaults to a reader on `appPool`. */
  readonly switches?: Pick<KillSwitchReader, 'isOn' | 'assertOn'> | undefined;
  /** Receives errors from idle auth-pool connections (e.g. a database restart); defaults to a process warning. */
  readonly onPoolError?: ((error: Error) => void) | undefined;
}

export interface AuthModule {
  readonly auth: ReturnType<typeof betterAuth>;
  handler(request: Request): Promise<Response>;
  close(): Promise<void>;
}

/** Extracts a `Headers` instance from whatever shape Better Auth's endpoint context exposes it as, without a hard type dependency on `better-auth`'s internal context type. */
function extractHeaders(ctx: unknown): Headers | undefined {
  if (typeof ctx !== 'object' || ctx === null) return undefined;
  const direct = (ctx as { headers?: unknown }).headers;
  if (direct instanceof Headers) return direct;
  const request = (ctx as { request?: unknown }).request;
  if (request instanceof Request) return request.headers;
  return undefined;
}

export function createAuthModule(deps: AuthModuleDeps): AuthModule {
  const authPool = new pg.Pool({
    connectionString: deps.authDatabaseUrl,
    max: deps.authPoolMax ?? 5,
  });
  // A connection that dies (database restart, failover, network timeout) emits `error`; without a
  // listener that event crashes the process.
  watchPoolErrors(
    authPool,
    deps.onPoolError ??
      ((error) => process.emitWarning(`auth database client error: ${error.message}`)),
  );
  const db = drizzle(authPool);

  const secondaryStorage: AuthSecondaryStorage = {
    get: (key) => deps.redis.get(key),
    getAndDelete: (key) => deps.redis.getDel(key),
    // Standard atomic-counter-with-TTL pattern: INCR always happens first (atomic), EXPIRE only on
    // the call that just created the key (value === 1), so later increments never extend the window.
    increment: async (key, ttlSeconds) => {
      const value = await deps.redis.incr(key);
      if (value === 1) await deps.redis.expire(key, ttlSeconds);
      return value;
    },
    set: async (key, value, ttlSeconds) => {
      await deps.redis.set(key, value, ttlSeconds !== undefined ? { EX: ttlSeconds } : undefined);
    },
    delete: async (key) => {
      await deps.redis.del(key);
    },
  };

  const switches = deps.switches ?? createKillSwitches(deps.appPool);
  const otpRouter = createOtpRouter({
    adapters: deps.otpAdapters,
    tracker: createRedisOtpDeliveryTracker(deps.redis),
    switches,
  });

  const { hook: verificationCreateAfter, consumePendingVerificationId } =
    buildVerificationCreateAfterHook();

  // `.current` is assigned once betterAuth() returns, below; `otp.sendOTP` is only ever invoked by a
  // real HTTP request arriving later, never during construction, so this is safe.
  const authRef: { current: ReturnType<typeof betterAuth> | undefined } = { current: undefined };

  const otp: PhoneOtpPort = {
    async sendOTP(data, ctx) {
      let uid: string | undefined;
      const headers = extractHeaders(ctx);
      if (headers) {
        try {
          const session = await authRef.current?.api.getSession({ headers });
          uid = session?.user.id;
        } catch {
          // Best-effort correlation only (services/api/src/auth/otp/router.ts's
          // OtpDeliveryTracker); a failed lookup never blocks sending the code.
        }
      }
      const verificationId = consumePendingVerificationId(data.phoneNumber);
      const fixed = deps.fixedCodes?.match(data.phoneNumber);
      if (fixed !== undefined) {
        await useFixedCode(ctx, data.phoneNumber, fixed.code);
        deps.onFixedCode?.({ kind: fixed.kind, number: maskedNumber(data.phoneNumber) });
        return;
      }
      try {
        await otpRouter.sendOTP({
          phoneE164: data.phoneNumber,
          code: data.code,
          uid,
          verificationId,
        });
      } catch (error) {
        // A `DomainError` keeps its own status and wire body (e.g. `switched_off` is a 409).
        throw toApiError(error);
      }
    },
  };

  // buildDatabaseHooks() only ever defines `user.create.after` today; `verification.create.after`
  // is added here rather than there so services/api/src/auth/hooks.ts stays free of the in-memory
  // verification-id tracking map, which is otp-router plumbing, not a `public.users` concern.
  const databaseHooks = buildDatabaseHooks({ appPool: deps.appPool, switches });
  const accountCreateAfter = buildAccountCreateAfterHook({
    appPool: deps.appPool,
    // `authRef.current` is assigned once betterAuth() returns below; this hook is only ever invoked
    // by a real `/link-social` or `/sign-in/social` request arriving later, same as `otp.sendOTP`.
    getInternalAdapter: async () => {
      const context = (await authRef.current?.$context) as unknown as {
        internalAdapter: {
          updateUser(userId: string, data: Record<string, unknown>): Promise<unknown>;
        };
      };
      return context.internalAdapter;
    },
  });
  const mergedDatabaseHooks: AuthConfigDeps['databaseHooks'] = {
    ...databaseHooks,
    verification: {
      create: {
        after: (verification) => {
          verificationCreateAfter(verification);
          return Promise.resolve();
        },
      },
    },
    account: {
      create: {
        after: (account) => accountCreateAfter(account),
      },
    },
  };

  const requestGuardsDeps = {
    attestation: {
      appPool: deps.appPool,
      redis: deps.redis,
      config: deps.attestation,
      ...(deps.onAttestationFailure ? { onAttestationFailure: deps.onAttestationFailure } : {}),
      ...(deps.onAttestationVerified ? { onAttestationVerified: deps.onAttestationVerified } : {}),
    },
    rateLimit: { redis: deps.redis },
    pumping: { redis: deps.redis, config: deps.pumping ?? defaultPumpingConfig() },
    appPool: deps.appPool,
  };

  const auth = betterAuth(
    buildAuthOptions({
      db,
      secondaryStorage,
      secret: deps.secret,
      baseUrl: deps.baseUrl,
      trustedOrigins: deps.trustedOrigins,
      otp,
      databaseHooks: mergedDatabaseHooks,
      jwksRotationIntervalSeconds: deps.jwksRotationIntervalSeconds,
      rateLimit: deps.rateLimit,
      apple: deps.apple,
      google: deps.google,
      isProduction: deps.isProduction,
      hooks: {
        before: buildRequestBeforeHook(requestGuardsDeps),
        after: buildRequestAfterHook(requestGuardsDeps),
      },
    }),
  );
  authRef.current = auth;
  const handler = withTestNumberRecycling(
    wrapHandlerWithMergeIntercept((request) => auth.handler(request), {
      auth,
      secret: deps.secret,
    }),
    {
      numbers: deps.fixedCodes,
      users: async () => ((await auth.$context) as unknown as { adapter: never }).adapter,
    },
  );

  return {
    auth,
    handler,
    close: () => authPool.end(),
  };
}

export type { AuthConfigDeps, AuthSecondaryStorage, PhoneOtpPort } from './config';
