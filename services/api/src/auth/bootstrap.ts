/**
 * Builds every Better Auth dependency this module needs from process env (services/api/src/env.ts),
 * so `services/api/src/index.ts` stays a thin bootstrap and every builder here is a pure,
 * independently testable function. Each provider/channel is constructed only when its own
 * credentials are present — absent ones are simply omitted (services/api/src/auth/config.ts and
 * services/api/src/auth/otp/router.ts already treat a missing provider/channel as "not configured",
 * never faked).
 */
import type { BetterAuthOptions } from 'better-auth';

import { crypto as dbCrypto } from '@cp/db';

import type { AttestationConfig } from '../abuse/attestation';
import {
  buildAndroidAttestationFromEnv,
  type PlayIntegrityEnv,
} from '../abuse/attestation/play-integrity-env';
import type { AppleClientSecretConfig } from './social/apple';
import type { AppleProviderConfig } from './social/apple';
import type { GoogleProviderConfig } from './social/google';
import type { HttpClient } from './otp/whatsapp';
import { createWhatsAppSender } from './otp/whatsapp';
import { createPreludeSender } from './otp/prelude';
import { createTelegramGatewaySender } from './otp/telegram';
import type { OtpChannelAdapter } from './otp/router';
import type { OtpChannel } from './otp/countries';
import type { ApiEnv } from '../env';

const { parseFieldEncryptionKeys } = dbCrypto;
type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

/**
 * The app's own custom URL schemes (apps/mobile/app.config.ts) plus `exp://` (Expo Go dev client,
 * which `@better-auth/expo`'s own plugin only auto-trusts when `NODE_ENV=development`, not in a
 * deployed staging/production `NODE_ENV=production` process) and the staging web/admin origins
 * (apps/web, apps/admin `wrangler.jsonc`). Always included regardless of `APP_TRUSTED_ORIGINS`,
 * which only ever adds to this list (e.g. once the production web/admin domains go live).
 */
const BASE_TRUSTED_ORIGINS = [
  'critterpass://',
  'critterpass-staging://',
  'critterpass-dev://',
  'exp://',
  'https://staging.critterpass.app',
  'https://admin.staging.critterpass.app',
] as const;

export function buildTrustedOriginsFromEnv(env: Pick<ApiEnv, 'APP_TRUSTED_ORIGINS'>): string[] {
  const extra = env.APP_TRUSTED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...BASE_TRUSTED_ORIGINS, ...(extra ?? [])];
}

/** Better Auth's own rate limiter only ever keys by `(ip, path)` (services/api/src/abuse/rate-limits.ts) — the IP-dimensioned half of this phase's Requirements table. */
export function buildAuthRateLimitCustomRules(): NonNullable<
  BetterAuthOptions['rateLimit']
>['customRules'] {
  return {
    '/sign-in/anonymous': { window: 3600, max: 10 },
    '/phone-number/send-otp': { window: 3600, max: 10 },
  };
}

type OtpEnv = Pick<
  ApiEnv,
  | 'WHATSAPP_PHONE_NUMBER_ID'
  | 'WHATSAPP_ACCESS_TOKEN'
  | 'WHATSAPP_TEMPLATE_NAME'
  | 'WHATSAPP_LANGUAGE_CODE'
  | 'TELEGRAM_GATEWAY_TOKEN'
  | 'PRELUDE_API_KEY'
  | 'PUBLIC_BASE_URL'
>;

/** One real `fetch`-backed `HttpClient` shared by every channel — a network boundary, not a double: `services/api/test/auth/otp.db.test.ts` is the one place a recorded-fixture double replaces this. */
export function nodeFetchHttpClient(): HttpClient {
  return { fetch: (input, init) => fetch(input, init) };
}

export function buildOtpAdaptersFromEnv(
  env: OtpEnv,
  http: HttpClient = nodeFetchHttpClient(),
): Partial<Record<OtpChannel, OtpChannelAdapter>> {
  const adapters: Partial<Record<OtpChannel, OtpChannelAdapter>> = {};

  if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_TEMPLATE_NAME) {
    adapters.whatsapp = createWhatsAppSender({
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      templateName: env.WHATSAPP_TEMPLATE_NAME,
      languageCode: env.WHATSAPP_LANGUAGE_CODE ?? 'en',
      http,
    });
  }
  if (env.TELEGRAM_GATEWAY_TOKEN) {
    // The Gateway only accepts an HTTPS callback; local dev (http://localhost) sends without one.
    const callbackUrl = env.PUBLIC_BASE_URL.startsWith('https://')
      ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/telegram-gateway`
      : undefined;
    adapters.telegram = createTelegramGatewaySender({
      token: env.TELEGRAM_GATEWAY_TOKEN,
      http,
      ...(callbackUrl !== undefined ? { callbackUrl } : {}),
    });
  }
  if (env.PRELUDE_API_KEY) {
    adapters.prelude = createPreludeSender({ apiKey: env.PRELUDE_API_KEY, http });
  }
  return adapters;
}

type AttestationEnv = Pick<
  ApiEnv,
  | 'ATTESTATION_MODE'
  | 'APPLE_APP_ATTEST_TEAM_ID'
  | 'APPLE_APP_ATTEST_BUNDLE_ID'
  | 'APPLE_APP_ATTEST_ROOT_CERT_PEM'
  | 'APPLE_APP_ATTEST_ALLOW_DEV_ENV'
> &
  PlayIntegrityEnv;

/** iOS runs `log` regardless of `ATTESTATION_MODE` until a verified Apple root cert is provisioned; Android follows `ATTESTATION_MODE` once Play Integrity credentials and signing certificate digests are set (play-integrity-env.ts), `log` before. */
export function buildAttestationConfigFromEnv(env: AttestationEnv): AttestationConfig {
  const hasRealCert = env.APPLE_APP_ATTEST_ROOT_CERT_PEM !== undefined;
  const iosMode = hasRealCert ? env.ATTESTATION_MODE : 'log';
  const { androidMode, android } = buildAndroidAttestationFromEnv(env);
  return {
    iosMode,
    androidMode,
    appAttest: {
      teamId: env.APPLE_APP_ATTEST_TEAM_ID ?? 'UNCONFIGURED',
      bundleId: env.APPLE_APP_ATTEST_BUNDLE_ID ?? 'app.critterpass',
      rootCertificatePem:
        env.APPLE_APP_ATTEST_ROOT_CERT_PEM ??
        'unconfigured: no real Apple App Attest root provisioned yet, iosMode is forced to log',
      allowDevelopmentEnvironment: env.APPLE_APP_ATTEST_ALLOW_DEV_ENV,
    },
    android,
  };
}

type AppleSocialEnv = Pick<ApiEnv, 'APPLE_SOCIAL_CLIENT_IDS' | 'APPLE_SOCIAL_APP_BUNDLE_ID'>;

export function buildAppleSocialConfigFromEnv(
  env: AppleSocialEnv,
): AppleProviderConfig | undefined {
  if (!env.APPLE_SOCIAL_CLIENT_IDS) return undefined;
  const clientId = env.APPLE_SOCIAL_CLIENT_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (clientId.length === 0) return undefined;
  return {
    clientId,
    ...(env.APPLE_SOCIAL_APP_BUNDLE_ID
      ? { appBundleIdentifier: env.APPLE_SOCIAL_APP_BUNDLE_ID }
      : {}),
  };
}

export function buildGoogleSocialConfigFromEnv(
  env: Pick<ApiEnv, 'GOOGLE_SOCIAL_CLIENT_IDS'>,
): GoogleProviderConfig | undefined {
  if (!env.GOOGLE_SOCIAL_CLIENT_IDS) return undefined;
  const clientIds = env.GOOGLE_SOCIAL_CLIENT_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return clientIds.length > 0 ? { clientIds } : undefined;
}

type AppleSiwaEnv = Pick<
  ApiEnv,
  | 'APPLE_SIWA_KEY_ID'
  | 'APPLE_SIWA_PRIVATE_KEY_PEM'
  | 'APPLE_SIWA_REDIRECT_URI'
  | 'APPLE_APP_ATTEST_TEAM_ID'
> &
  AppleSocialEnv;

export interface AppleSiwaBootstrapConfig {
  readonly clientSecretConfig: AppleClientSecretConfig;
  readonly redirectUri: string;
}

/** Only buildable once the service id's own ES256 signing key (a separate Apple Developer credential from the ID-token client ids above) and a redirect URI are both provisioned. */
export function buildAppleSiwaConfigFromEnv(
  env: AppleSiwaEnv,
): AppleSiwaBootstrapConfig | undefined {
  const clientId = env.APPLE_SOCIAL_CLIENT_IDS?.split(',')[0]?.trim();
  if (
    !env.APPLE_SIWA_KEY_ID ||
    !env.APPLE_SIWA_PRIVATE_KEY_PEM ||
    !env.APPLE_SIWA_REDIRECT_URI ||
    !env.APPLE_APP_ATTEST_TEAM_ID ||
    !clientId
  ) {
    return undefined;
  }
  return {
    clientSecretConfig: {
      teamId: env.APPLE_APP_ATTEST_TEAM_ID,
      keyId: env.APPLE_SIWA_KEY_ID,
      clientId,
      privateKeyPem: env.APPLE_SIWA_PRIVATE_KEY_PEM,
    },
    redirectUri: env.APPLE_SIWA_REDIRECT_URI,
  };
}

type FieldEncryptionEnv = Pick<ApiEnv, 'FIELD_ENCRYPTION_KEYS' | 'FIELD_ENCRYPTION_ACTIVE_KEY_ID'>;

/** Absent until at least one key pair is provisioned; every route needing it (SIWA authorization-code capture) is then simply not registered, never run against a fake key. */
export function buildFieldEncryptionKeyringFromEnv(
  env: FieldEncryptionEnv,
): FieldEncryptionKeyring | undefined {
  if (!env.FIELD_ENCRYPTION_KEYS || !env.FIELD_ENCRYPTION_ACTIVE_KEY_ID) return undefined;
  const keys = parseFieldEncryptionKeys(env.FIELD_ENCRYPTION_KEYS);
  if (!(env.FIELD_ENCRYPTION_ACTIVE_KEY_ID in keys)) return undefined;
  return { activeKeyId: env.FIELD_ENCRYPTION_ACTIVE_KEY_ID, keys };
}
