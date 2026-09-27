import { z } from 'zod';

/** Env files (and unresolved platform references) write unset values as `KEY=`; treat `''` as absent. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalUrl = z.preprocess(emptyAsUndefined, z.url().optional());
const optionalString = z.preprocess(emptyAsUndefined, z.string().min(1).optional());
/** `'true'`/`'false'`/unset — every other truthy-string convention (`1`, `yes`) stays out of env files by repo convention. */
const boolFlag = (defaultValue: boolean) =>
  z.preprocess(
    emptyAsUndefined,
    z
      .enum(['true', 'false'])
      .default(defaultValue ? 'true' : 'false')
      .transform((value) => value === 'true'),
  );

/** Runtime configuration for the api service, validated once at boot. */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Deployment tier; NODE_ENV stays `production` in staging, so tier-specific behaviour keys off this. */
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Pooled connection (PgBouncer, port 6432) used by request transactions. */
  DATABASE_URL: z.url(),
  /** Direct connection (port 5432), read only by the pre-deploy migration step. */
  DATABASE_DIRECT_URL: optionalUrl,
  REDIS_URL: z.url(),
  PUBLIC_BASE_URL: z.url(),
  SENTRY_DSN: optionalUrl,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  COMMIT_SHA: z.preprocess(emptyAsUndefined, z.string().min(1).default('dev')),
  /** Better Auth's own Postgres connection, authenticated as the `auth` role (docs/data-model.md §2): a narrower grant than the app's own pooled `app_owner`-derived connection. */
  AUTH_DATABASE_URL: z.url(),
  /** Encrypts JWKS private keys at rest and signs Better Auth's internal cookies; 32+ chars, generated with `openssl rand -base64 32`. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Comma-separated app scheme(s)/origins Better Auth accepts for OAuth redirects and the Expo plugin; mobile schemes always included regardless of this value. */
  APP_TRUSTED_ORIGINS: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),

  // --- Attestation (docs/data-model.md §3.1; this phase's Non-code dependencies table) ---
  // No Apple Developer team id or a verified real device fixture exists yet, so this defaults to
  // `log` (never blocks a sign-in) regardless of deployment tier; flip to `enforce` once
  // APPLE_APP_ATTEST_ROOT_CERT_PEM is a real, checked-in-by-reference Apple root, not before —
  // `services/api/src/index.ts` also forces `log` whenever that PEM is unset, so this alone cannot
  // turn enforcement on.
  ATTESTATION_MODE: z.enum(['enforce', 'log']).default('log'),
  APPLE_APP_ATTEST_TEAM_ID: optionalString,
  APPLE_APP_ATTEST_BUNDLE_ID: optionalString,
  /** PEM-encoded Apple App Attest root CA — public data (Apple publishes it), not a secret; absent until a real one is verified and provisioned. */
  APPLE_APP_ATTEST_ROOT_CERT_PEM: optionalString,
  /** Accepts Apple's development-environment attestation environment (staging default: on; App Store builds must set this to `false`). */
  APPLE_APP_ATTEST_ALLOW_DEV_ENV: boolFlag(true),
  // No Play Integrity Google Cloud service account is provisioned yet (non-code dependency table),
  // and this repo has no token-exchange client for it — Android attestation always runs in `log`
  // mode until that client exists, independent of ATTESTATION_MODE.

  // --- Phone OTP sender router (docs/product-decisions.md's OTP sender-router decision; each
  // channel skipped when its credentials are absent, never faked — services/api/src/auth/otp/router.ts falls back
  // automatically). ---
  WHATSAPP_PHONE_NUMBER_ID: optionalString,
  WHATSAPP_ACCESS_TOKEN: optionalString,
  WHATSAPP_TEMPLATE_NAME: optionalString,
  WHATSAPP_LANGUAGE_CODE: optionalString,
  /** Verifies `X-Hub-Signature-256` on `POST /webhooks/whatsapp`; Meta app secret, not the access token above. */
  WHATSAPP_APP_SECRET: optionalString,
  /** Echoed back on Meta's one-time `GET /webhooks/whatsapp` verification handshake. */
  WHATSAPP_VERIFY_TOKEN: optionalString,
  TWILIO_VERIFY_ACCOUNT_SID: optionalString,
  TWILIO_VERIFY_AUTH_TOKEN: optionalString,
  TWILIO_VERIFY_SERVICE_SID: optionalString,
  PRELUDE_API_KEY: optionalString,

  // --- Social sign-in (Apple/Google ID-token linking); button hidden client-side via server config
  // when unset, `link-social`/`sign-in/social` for that provider fails with Better Auth's own
  // provider-not-configured error rather than anything faked here. ---
  /** Comma-separated bundle/service ids Apple's ID token `aud` may carry. */
  APPLE_SOCIAL_CLIENT_IDS: optionalString,
  APPLE_SOCIAL_APP_BUNDLE_ID: optionalString,
  /** Comma-separated iOS/Android/web OAuth client ids Google's ID token `aud` may carry. */
  GOOGLE_SOCIAL_CLIENT_IDS: optionalString,

  // --- Sign in with Apple authorization-code exchange (`POST /v1/auth/apple/authorization-code`);
  // a separate Apple Developer credential from APPLE_SOCIAL_CLIENT_IDS above (a service id's own
  // ES256 signing key, used only to mint the client secret Apple's token endpoint expects). ---
  APPLE_SIWA_KEY_ID: optionalString,
  /** PEM-encoded ES256 private key for the Sign in with Apple service id. */
  APPLE_SIWA_PRIVATE_KEY_PEM: optionalString,
  APPLE_SIWA_REDIRECT_URI: optionalUrl,

  // --- Field-level encryption (packages/db/src/crypto): AES-256-GCM keyring for `user_private`
  // phone/email columns, device_action_keys secrets, and the Apple SIWA refresh token above. Absent
  // in an environment with none of those features live yet — every route needing it is then simply
  // not registered (services/api/src/index.ts), never run against a fake key. ---
  /** `keyId1:base64key1,keyId2:base64key2`; each value is 32 raw bytes, base64-encoded (`openssl rand -base64 32`). */
  FIELD_ENCRYPTION_KEYS: optionalString,
  /** Must name one of the key ids in FIELD_ENCRYPTION_KEYS; new writes use this key, old ones stay decryptable via the others. */
  FIELD_ENCRYPTION_ACTIVE_KEY_ID: optionalString,
  /** Peppers `user_private.phone_hash` (HMAC-SHA256, packages/db/src/crypto/hmac.ts) — a separate secret from FIELD_ENCRYPTION_KEYS so rotating one never invalidates the other. */
  PHONE_HASH_PEPPER: optionalString,
  /** Mapbox Geocoding v6 server key (src/geocoding/mapbox.ts); omitted = forward geocoding stays
   *  local-only (our pois + cities), no Mapbox fallback for addresses. */
  MAPBOX_TOKEN: optionalString,
  /** Public base URL the `cp-tiles` R2 bucket (or its `tiles.critterpass.app` custom domain, once
   *  attached — infra/cloudflare/tiles/wrangler.toml) serves PMTiles/fonts/sprite from; read by
   *  src/places/map-regions.ts to build the manifest's `url`. */
  TILES_BASE_URL: z.url().default('https://pub-0cf3d04afb394624afbe8f117d1f198b.r2.dev'),

  // --- Realtime (Centrifugo proxies, docs/api-contracts.md §5.7) ---
  /** Shared header value Centrifugo sends on subscribe/publish proxy calls (its
   *  `CENTRIFUGO_CHANNEL_PROXY_*_HTTP_STATIC_HEADERS`); unset = the proxy routes are not mounted and
   *  every proxied subscribe fails closed. Generate with `openssl rand -base64 32`. */
  RT_PROXY_SECRET: z.preprocess(emptyAsUndefined, z.string().min(32).optional()),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

/** Parses the environment, failing fast with every problem listed (values are never echoed). */
export function loadApiEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid api environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}
