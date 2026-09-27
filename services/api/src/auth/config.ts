/**
 * Better Auth options (docs/product-decisions.md D4: minimal plugin set, patch advisories within
 * 48 h). Built as a pure function of injected dependencies (packages/db's Drizzle instance, Redis
 * secondary storage, the OTP send port) rather than reaching for env vars itself, so
 * services/api/test/auth/*.db.test.ts can build a real instance against a Testcontainers Postgres
 * without needing the whole process environment.
 */
import { schema } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { expo } from '@better-auth/expo';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin, anonymous, jwt, phoneNumber } from 'better-auth/plugins';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const ONE_DAY_SECONDS = 60 * 60 * 24;
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;
const OTP_LENGTH = 6;
const OTP_EXPIRES_IN_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;

/**
 * `secondaryStorage` shape Better Auth expects (rate limits, session-adjacent caches); matches
 * `@better-auth/core`'s own `SecondaryStorage` exactly (`getAndDelete`/`increment` are required —
 * distributed-safe rate-limit counters need the atomic increment).
 */
export interface AuthSecondaryStorage {
  get(key: string): Promise<unknown>;
  getAndDelete(key: string): Promise<unknown>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  set(key: string, value: string, ttlSeconds?: number): Promise<unknown>;
  delete(key: string): Promise<string | void | null>;
}

/**
 * The one seam `config.ts` needs from the phone OTP sender router
 * (services/api/src/auth/otp/router.ts, T4): kept as an injected port so this file never depends on
 * provider adapters that do not exist yet at every point in the build. `context` is Better Auth's
 * endpoint context (untyped here to avoid a hard dependency on its internal type); consumers use
 * services/api/src/auth/index.ts's `extractHeaders` to read a session from it.
 */
export interface PhoneOtpPort {
  sendOTP(data: { phoneNumber: string; code: string }, context: unknown): Promise<void>;
}

/**
 * Drizzle db instance shape the adapter needs — `drizzleAdapter`'s own first parameter type, so this
 * file depends on exactly what the adapter accepts (a loose `{[key: string]: any}`) rather than a
 * specific drizzle-orm driver type, without introducing an unsafe `any` of its own.
 */
export type AuthDrizzleDb = Parameters<typeof drizzleAdapter>[0];

export interface AuthConfigDeps {
  readonly db: AuthDrizzleDb;
  readonly secondaryStorage: AuthSecondaryStorage;
  readonly secret: string;
  readonly baseUrl: string;
  readonly trustedOrigins: readonly string[];
  readonly otp: PhoneOtpPort;
  readonly databaseHooks: NonNullable<BetterAuthOptions['databaseHooks']>;
  /** Overrides the jwt plugin's key rotation interval; only ever set by jwks.db.test.ts to force rotation inside one run. */
  readonly jwksRotationIntervalSeconds?: number | undefined;
}

export function buildAuthOptions(deps: AuthConfigDeps): BetterAuthOptions {
  return {
    baseURL: deps.baseUrl,
    secret: deps.secret,
    trustedOrigins: [...deps.trustedOrigins],
    database: drizzleAdapter(deps.db, {
      provider: 'pg',
      schemaName: 'auth',
      usePlural: false,
      transaction: true,
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
        jwks: schema.authJwks,
      },
    }),
    secondaryStorage: deps.secondaryStorage,
    // UUIDv7 everywhere (docs/code-standards.md §2 IDs), for every model this options object creates
    // an id for, so public.users/auth.user share the exact same value and sort chronologically.
    advanced: {
      database: { generateId: () => generateUuidV7() },
      // Railway sets x-real-ip (docs/system-architecture.md §6); 64 collapses an IPv6 /64 to one
      // bucket for rate limiting, matching F-029's per-IP limits without a client controlling it.
      ipAddress: { ipAddressHeaders: ['x-real-ip'], ipv6Subnet: 64 },
    },
    session: {
      expiresIn: THIRTY_DAYS_SECONDS,
      updateAge: ONE_DAY_SECONDS,
      // Without this, Better Auth stores sessions in secondaryStorage (Redis) once one is
      // configured at all, dropping the real auth.session table docs/data-model.md §3.1 describes.
      storeSessionInDatabase: true,
    },
    verification: {
      // Same reasoning as session.storeSessionInDatabase: keep OTP/verification rows in Postgres.
      storeInDatabase: true,
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        // Anonymous users carry a synthesized placeholder email
        // (temp-<id>@anonymous.placeholder.invalid); without this, linking a real Apple/Google
        // identity to an anonymous session fails with LINKING_DIFFERENT_EMAILS_NOT_ALLOWED (phase-2
        // spike finding, docs/system-architecture.md §11 S-AUTH).
        allowDifferentEmails: true,
      },
    },
    rateLimit: {
      // Better Auth only rate-limits in production by default; every environment needs it here so
      // F-029's limits are provable in Testcontainers tests, not just in prod.
      enabled: true,
      storage: 'secondary-storage',
    },
    databaseHooks: deps.databaseHooks,
    plugins: [
      anonymous(),
      phoneNumber({
        sendOTP: (data, context) => deps.otp.sendOTP(data, context),
        otpLength: OTP_LENGTH,
        expiresIn: OTP_EXPIRES_IN_SECONDS,
        allowedAttempts: OTP_MAX_ATTEMPTS,
      }),
      jwt({
        jwt: {
          // aud is set per-request by services/api/src/auth/tokens.ts's own GET /api/auth/token
          // handler (it calls the plugin's server-only signJWT with an explicit payload); this
          // default only backstops Better Auth's own incidental `set-auth-jwt` header.
          audience: 'sync',
          expirationTime: '15m',
        },
        jwks: {
          keyPairConfig: { alg: 'EdDSA' },
          rotationInterval: deps.jwksRotationIntervalSeconds ?? NINETY_DAYS_SECONDS,
          gracePeriod: SEVEN_DAYS_SECONDS,
        },
        // The incidental header duplicates a sync-audience token on every /get-session call; the
        // real PowerSync/Centrifugo tokens always come from GET /api/auth/token?aud=.
        disableSettingJwtHeader: true,
      }),
      admin({
        // `support`/`content` (docs/product-decisions.md's admin plugin note) need their own
        // `roles`-configured permission sets before they can be added to adminRoles (Better Auth
        // rejects an adminRoles entry with no matching roles definition) — a later task's full
        // permission matrix, impersonation gating and ops.admin_audit wiring. `admin` alone uses
        // Better Auth's own built-in default role/permissions.
        adminRoles: ['admin'],
      }),
      expo(),
    ],
  };
}

export type AuthInstance = ReturnType<typeof betterAuth>;

export function createBetterAuth(deps: AuthConfigDeps): AuthInstance {
  return betterAuth(buildAuthOptions(deps));
}
