/**
 * Pure env → config builders (services/api/src/auth/bootstrap.ts) that wire real Better Auth
 * dependencies for services/api/src/index.ts. No DB, no network: each builder is a function of a
 * plain env object.
 */
import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  buildAppleSiwaConfigFromEnv,
  buildAppleSocialConfigFromEnv,
  buildAttestationConfigFromEnv,
  buildAuthRateLimitCustomRules,
  buildFieldEncryptionKeyringFromEnv,
  buildGoogleSocialConfigFromEnv,
  buildOtpAdaptersFromEnv,
  buildTrustedOriginsFromEnv,
} from '../../src/auth/bootstrap';
import { loadApiEnv } from '../../src/env';

// A throwaway ES256 key generated per run, the same shape as a Sign in with Apple .p8 key.
const SIWA_PRIVATE_KEY_PEM = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();

describe('buildTrustedOriginsFromEnv', () => {
  it('always includes the app schemes and staging web/admin origins', () => {
    const origins = buildTrustedOriginsFromEnv({ APP_TRUSTED_ORIGINS: undefined });
    expect(origins).toEqual(
      expect.arrayContaining([
        'critterpass://',
        'critterpass-staging://',
        'critterpass-dev://',
        'exp://',
        'https://staging.critterpass.app',
        'https://admin.staging.critterpass.app',
      ]),
    );
  });

  it('appends comma-separated extras without dropping the base list', () => {
    const origins = buildTrustedOriginsFromEnv({
      APP_TRUSTED_ORIGINS: 'https://critterpass.app, https://admin.critterpass.app',
    });
    expect(origins).toContain('critterpass://');
    expect(origins).toContain('https://critterpass.app');
    expect(origins).toContain('https://admin.critterpass.app');
  });
});

const baseEnv = (): Record<string, string> => ({
  DATABASE_URL: 'postgres://app@localhost:54320/app',
  REDIS_URL: 'redis://localhost:63790',
  PUBLIC_BASE_URL: 'http://localhost:8787',
  AUTH_DATABASE_URL: 'postgres://auth@localhost:54320/app',
  BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
});

describe('buildAuthRateLimitCustomRules', () => {
  it('rate-limits anonymous sign-in and send-otp to 10/h/IP by default', () => {
    const env = loadApiEnv(baseEnv());
    expect(buildAuthRateLimitCustomRules(env)).toEqual({
      '/sign-in/anonymous': { window: 3600, max: 10 },
      '/phone-number/send-otp': { window: 3600, max: 10 },
    });
  });

  it('reads each hourly cap from env, treating an empty value as the default', () => {
    const env = loadApiEnv({
      ...baseEnv(),
      AUTH_ANON_RATE_LIMIT_PER_HOUR: '200',
      AUTH_OTP_RATE_LIMIT_PER_HOUR: '',
    });
    expect(buildAuthRateLimitCustomRules(env)).toEqual({
      '/sign-in/anonymous': { window: 3600, max: 200 },
      '/phone-number/send-otp': { window: 3600, max: 10 },
    });
  });

  it('rejects a cap that is not a positive whole number', () => {
    expect(() => loadApiEnv({ ...baseEnv(), AUTH_OTP_RATE_LIMIT_PER_HOUR: '0' })).toThrow();
    expect(() => loadApiEnv({ ...baseEnv(), AUTH_ANON_RATE_LIMIT_PER_HOUR: 'lots' })).toThrow();
  });
});

describe('buildOtpAdaptersFromEnv', () => {
  const http = { fetch: () => Promise.reject(new Error('never called by this test')) };

  it('returns no adapters when no channel has credentials', () => {
    expect(
      buildOtpAdaptersFromEnv(
        {
          WHATSAPP_PHONE_NUMBER_ID: undefined,
          WHATSAPP_ACCESS_TOKEN: undefined,
          WHATSAPP_TEMPLATE_NAME: undefined,
          WHATSAPP_LANGUAGE_CODE: undefined,
          TELEGRAM_GATEWAY_TOKEN: undefined,
          PRELUDE_API_KEY: undefined,
          PUBLIC_BASE_URL: 'https://api.example.test',
        },
        http,
      ),
    ).toEqual({});
  });

  it('builds only the channels with a complete credential set', () => {
    const adapters = buildOtpAdaptersFromEnv(
      {
        WHATSAPP_PHONE_NUMBER_ID: 'pn-1',
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_TEMPLATE_NAME: 'auth_code',
        WHATSAPP_LANGUAGE_CODE: undefined,
        TELEGRAM_GATEWAY_TOKEN: 'gateway-token',
        PRELUDE_API_KEY: 'prelude-key',
        PUBLIC_BASE_URL: 'https://api.example.test',
      },
      http,
    );
    expect(Object.keys(adapters).sort()).toEqual(['prelude', 'telegram', 'whatsapp']);
  });

  it('skips a channel missing even one of its required credentials', () => {
    const adapters = buildOtpAdaptersFromEnv(
      {
        WHATSAPP_PHONE_NUMBER_ID: 'pn-1',
        WHATSAPP_ACCESS_TOKEN: undefined,
        WHATSAPP_TEMPLATE_NAME: 'auth_code',
        WHATSAPP_LANGUAGE_CODE: undefined,
        TELEGRAM_GATEWAY_TOKEN: undefined,
        PRELUDE_API_KEY: undefined,
        PUBLIC_BASE_URL: 'https://api.example.test',
      },
      http,
    );
    expect(adapters).toEqual({});
  });
});

describe('Telegram Gateway wiring', () => {
  const otpEnv = {
    WHATSAPP_PHONE_NUMBER_ID: undefined,
    WHATSAPP_ACCESS_TOKEN: undefined,
    WHATSAPP_TEMPLATE_NAME: undefined,
    WHATSAPP_LANGUAGE_CODE: undefined,
    TELEGRAM_GATEWAY_TOKEN: 'gateway-token',
    PRELUDE_API_KEY: undefined,
  };

  async function sentBody(publicBaseUrl: string): Promise<Record<string, unknown>> {
    let body: Record<string, unknown> = {};
    const http = {
      fetch: (_input: string, init: RequestInit) => {
        body = JSON.parse(init.body as string) as Record<string, unknown>;
        return Promise.resolve(
          Response.json({ ok: true, result: { request_id: 'req-1' } }, { status: 200 }),
        );
      },
    };
    const adapters = buildOtpAdaptersFromEnv({ ...otpEnv, PUBLIC_BASE_URL: publicBaseUrl }, http);
    await adapters.telegram?.send({ phoneE164: '+6598765432', code: '123456' });
    return body;
  }

  it('points the delivery callback at the public HTTPS origin', async () => {
    expect((await sentBody('https://api.example.test/')).callback_url).toBe(
      'https://api.example.test/webhooks/telegram-gateway',
    );
  });

  it('sends without a callback from a plain-HTTP origin (local dev)', async () => {
    expect(await sentBody('http://localhost:8787')).not.toHaveProperty('callback_url');
  });

  it('parses the Gateway token and no longer reads any Twilio variable', () => {
    const env = loadApiEnv({
      DATABASE_URL: 'postgres://app@localhost:54320/app',
      REDIS_URL: 'redis://localhost:63790',
      PUBLIC_BASE_URL: 'http://localhost:8787',
      AUTH_DATABASE_URL: 'postgres://auth@localhost:54320/app',
      BETTER_AUTH_SECRET: 'test-secret-at-least-32-characters-long',
      TELEGRAM_GATEWAY_TOKEN: 'gateway-token',
      TWILIO_VERIFY_ACCOUNT_SID: 'ACexample',
      TWILIO_VERIFY_AUTH_TOKEN: 'token',
      TWILIO_VERIFY_SERVICE_SID: 'VAexample',
    });
    expect(env.TELEGRAM_GATEWAY_TOKEN).toBe('gateway-token');
    expect(Object.keys(env).filter((key) => key.startsWith('TWILIO'))).toEqual([]);
  });
});

describe('buildAttestationConfigFromEnv', () => {
  const noPlayIntegrity = {
    APP_ENV: 'staging',
    PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: undefined,
    PLAY_INTEGRITY_PACKAGE_NAME: undefined,
    PLAY_INTEGRITY_CERT_SHA256_DIGESTS: undefined,
  } as const;

  it('forces iosMode to log when no real root cert is configured, even if ATTESTATION_MODE is enforce', () => {
    const config = buildAttestationConfigFromEnv({
      ATTESTATION_MODE: 'enforce',
      APPLE_APP_ATTEST_TEAM_ID: undefined,
      APPLE_APP_ATTEST_BUNDLE_ID: undefined,
      APPLE_APP_ATTEST_ROOT_CERT_PEM: undefined,
      APPLE_APP_ATTEST_ALLOW_DEV_ENV: true,
      ...noPlayIntegrity,
    });
    expect(config.iosMode).toBe('log');
    expect(config.androidMode).toBe('log');
    expect(config.android).toBeUndefined();
  });

  it('honours ATTESTATION_MODE once a real root cert is configured', () => {
    const config = buildAttestationConfigFromEnv({
      ATTESTATION_MODE: 'enforce',
      APPLE_APP_ATTEST_TEAM_ID: 'TEAM123',
      APPLE_APP_ATTEST_BUNDLE_ID: 'app.critterpass',
      APPLE_APP_ATTEST_ROOT_CERT_PEM:
        '-----BEGIN CERTIFICATE-----\nreal\n-----END CERTIFICATE-----',
      APPLE_APP_ATTEST_ALLOW_DEV_ENV: false,
      ...noPlayIntegrity,
    });
    expect(config.iosMode).toBe('enforce');
    expect(config.appAttest.teamId).toBe('TEAM123');
    expect(config.appAttest.allowDevelopmentEnvironment).toBe(false);
  });

  it('wires Play Integrity for Android once its service account is set', () => {
    const config = buildAttestationConfigFromEnv({
      ATTESTATION_MODE: 'log',
      APPLE_APP_ATTEST_TEAM_ID: undefined,
      APPLE_APP_ATTEST_BUNDLE_ID: undefined,
      APPLE_APP_ATTEST_ROOT_CERT_PEM: undefined,
      APPLE_APP_ATTEST_ALLOW_DEV_ENV: true,
      ...noPlayIntegrity,
      PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: 'play-integrity@critterpass-test.iam.gserviceaccount.com',
        private_key: 'pem',
      }),
      PLAY_INTEGRITY_CERT_SHA256_DIGESTS: 'j-_Zgk1nkrEgNiXYBkUhlsXAvJXuGFr_xBY0tkfnhUw',
    });
    expect(config.androidMode).toBe('log');
    expect(config.android?.playIntegrity.packageName).toBe('app.critterpass.staging');
  });
});

describe('buildAppleSocialConfigFromEnv', () => {
  it('is undefined with no client ids configured', () => {
    expect(
      buildAppleSocialConfigFromEnv({
        APPLE_SOCIAL_CLIENT_IDS: undefined,
        APPLE_SOCIAL_APP_BUNDLE_ID: undefined,
      }),
    ).toBeUndefined();
  });

  it('splits a comma-separated client id list', () => {
    expect(
      buildAppleSocialConfigFromEnv({
        APPLE_SOCIAL_CLIENT_IDS: 'app.critterpass, app.critterpass.services',
        APPLE_SOCIAL_APP_BUNDLE_ID: 'app.critterpass',
      }),
    ).toEqual({
      clientId: ['app.critterpass', 'app.critterpass.services'],
      appBundleIdentifier: 'app.critterpass',
    });
  });
});

describe('buildGoogleSocialConfigFromEnv', () => {
  it('is undefined with no client ids configured', () => {
    expect(buildGoogleSocialConfigFromEnv({ GOOGLE_SOCIAL_CLIENT_IDS: undefined })).toBeUndefined();
  });

  it('splits a comma-separated client id list', () => {
    expect(
      buildGoogleSocialConfigFromEnv({ GOOGLE_SOCIAL_CLIENT_IDS: 'ios-id, android-id, web-id' }),
    ).toEqual({ clientIds: ['ios-id', 'android-id', 'web-id'] });
  });
});

describe('buildAppleSiwaConfigFromEnv', () => {
  it('is undefined unless every one of its credentials is present', () => {
    expect(
      buildAppleSiwaConfigFromEnv({
        APPLE_SIWA_KEY_ID: 'key-1',
        APPLE_SIWA_PRIVATE_KEY_PEM: undefined,
        APPLE_SIWA_REDIRECT_URI: 'https://api.critterpass.app/v1/auth/apple/authorization-code',
        APPLE_APP_ATTEST_TEAM_ID: 'TEAM123',
        APPLE_SOCIAL_CLIENT_IDS: 'app.critterpass',
      }),
    ).toBeUndefined();
  });

  it('builds a full config once every credential is present', () => {
    const config = buildAppleSiwaConfigFromEnv({
      APPLE_SIWA_KEY_ID: 'key-1',
      APPLE_SIWA_PRIVATE_KEY_PEM: SIWA_PRIVATE_KEY_PEM,
      APPLE_SIWA_REDIRECT_URI: 'https://api.critterpass.app/v1/auth/apple/authorization-code',
      APPLE_APP_ATTEST_TEAM_ID: 'TEAM123',
      APPLE_SOCIAL_CLIENT_IDS: 'app.critterpass, app.critterpass.services',
    });
    expect(config).toEqual({
      clientSecretConfig: {
        teamId: 'TEAM123',
        keyId: 'key-1',
        clientId: 'app.critterpass',
        privateKeyPem: SIWA_PRIVATE_KEY_PEM,
      },
      redirectUri: 'https://api.critterpass.app/v1/auth/apple/authorization-code',
    });
  });
});

describe('buildFieldEncryptionKeyringFromEnv', () => {
  it('is undefined with no keys configured', () => {
    expect(
      buildFieldEncryptionKeyringFromEnv({
        FIELD_ENCRYPTION_KEYS: undefined,
        FIELD_ENCRYPTION_ACTIVE_KEY_ID: undefined,
      }),
    ).toBeUndefined();
  });

  it('is undefined when the active key id names a key not in the keyring', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(
      buildFieldEncryptionKeyringFromEnv({
        FIELD_ENCRYPTION_KEYS: `k1:${key}`,
        FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k2',
      }),
    ).toBeUndefined();
  });

  it('parses a real keyring once both env vars agree', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    const keyring = buildFieldEncryptionKeyringFromEnv({
      FIELD_ENCRYPTION_KEYS: `k1:${key}`,
      FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
    });
    expect(keyring?.activeKeyId).toBe('k1');
    expect(keyring?.keys.k1).toEqual(Buffer.alloc(32, 7));
  });
});
