/**
 * Assembles Better Auth from injected infrastructure (a dedicated `auth`-role Postgres pool, the
 * app's own pool for the `public.users` hook, Redis). `services/api/src/app.ts` builds the concrete
 * dependency graph (real OTP adapters, real Redis) and receives back a thin `{handler, close}`
 * surface to mount; `services/api/test/auth/*.db.test.ts` builds the same module directly against
 * Testcontainers with fake OTP/attestation ports at the network boundary.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import {
  buildAuthOptions,
  type AuthConfigDeps,
  type AuthSecondaryStorage,
  type PhoneOtpPort,
} from './config';
import {
  buildAttestationBeforeHook,
  buildDatabaseHooks,
  buildVerificationCreateAfterHook,
} from './hooks';
import {
  createOtpRouter,
  createRedisOtpDeliveryTracker,
  type OtpChannelAdapter,
} from './otp/router';
import type { OtpChannel } from './otp/countries';
import { betterAuth } from 'better-auth';

import type { AttestationConfig } from '../abuse/attestation';

/** The subset of node-redis's client API this module needs; real shape (not `AuthSecondaryStorage`'s simplified one) so `services/api/src/app.ts` can pass its actual `redis` client through untouched. */
export interface AuthRedisClient {
  get(key: string): Promise<string | null>;
  getDel(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<number>;
  setEx(key: string, seconds: number, value: string): Promise<unknown>;
}

export interface AuthModuleDeps {
  readonly appPool: pg.Pool;
  readonly authDatabaseUrl: string;
  readonly redis: AuthRedisClient;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly otpAdapters: Partial<Record<OtpChannel, OtpChannelAdapter>>;
  readonly jwksRotationIntervalSeconds?: number | undefined;
  readonly rateLimit?: AuthConfigDeps['rateLimit'];
  readonly attestation: AttestationConfig;
  readonly onAttestationFailure?: (
    error: unknown,
    context: { installId: string | undefined; platform: string | undefined },
  ) => void;
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
  const authPool = new pg.Pool({ connectionString: deps.authDatabaseUrl, max: 10 });
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

  const otpRouter = createOtpRouter({
    adapters: deps.otpAdapters,
    tracker: createRedisOtpDeliveryTracker(deps.redis),
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
      await otpRouter.sendOTP({
        phoneE164: data.phoneNumber,
        code: data.code,
        uid,
        verificationId,
      });
    },
  };

  // buildDatabaseHooks() only ever defines `user.create.after` today; `verification.create.after`
  // is added here rather than there so services/api/src/auth/hooks.ts stays free of the in-memory
  // verification-id tracking map, which is otp-router plumbing, not a `public.users` concern.
  const databaseHooks = buildDatabaseHooks({ appPool: deps.appPool });
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
  };

  const attestationBeforeHook = buildAttestationBeforeHook({
    appPool: deps.appPool,
    redis: deps.redis,
    config: deps.attestation,
    ...(deps.onAttestationFailure ? { onAttestationFailure: deps.onAttestationFailure } : {}),
  });

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
      hooks: { before: attestationBeforeHook },
    }),
  );
  authRef.current = auth;

  return {
    auth,
    handler: (request) => auth.handler(request),
    close: () => authPool.end(),
  };
}

export type { AuthConfigDeps, AuthSecondaryStorage, PhoneOtpPort } from './config';
