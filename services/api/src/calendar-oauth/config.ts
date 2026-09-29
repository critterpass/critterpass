/**
 * Calendar OAuth configuration from the environment (names only in services/api/.env.example):
 * a provider is connectable only with its client id and secret, the field encryption keyring the
 * tokens are sealed with, and its `calendar.oauth_<provider>` flag on for the user (off by default:
 * Google's restricted-scope verification and the Microsoft app registration are pending).
 */
import { crypto as dbCrypto } from '@cp/db';
import { calendarOAuthFlag, type OAuthCalendarProvider } from '@cp/domain';
import { z } from 'zod';

import type { CalendarOAuthConfig, ProviderCredentials } from './client';

const optional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  APP_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  PUBLIC_BASE_URL: optional,
  FIELD_ENCRYPTION_KEYS: optional,
  FIELD_ENCRYPTION_ACTIVE_KEY_ID: optional,
  GOOGLE_CALENDAR_CLIENT_ID: optional,
  GOOGLE_CALENDAR_CLIENT_SECRET: optional,
  MICROSOFT_CALENDAR_CLIENT_ID: optional,
  MICROSOFT_CALENDAR_CLIENT_SECRET: optional,
  /** Overrides the app scheme the callback returns to (defaults per APP_ENV). */
  CALENDAR_OAUTH_APP_SCHEME: optional,
});

const APP_SCHEMES = {
  local: 'critterpass-dev',
  staging: 'critterpass-staging',
  production: 'critterpass',
} as const;

function pair(id: string | undefined, secret: string | undefined): ProviderCredentials | undefined {
  return id !== undefined && secret !== undefined
    ? { clientId: id, clientSecret: secret }
    : undefined;
}

/** The config, or `undefined` when no provider can work (no keyring or no base URL). */
export function calendarOAuthConfigFromEnv(
  source: Readonly<Record<string, string | undefined>>,
): CalendarOAuthConfig | undefined {
  const env = envSchema.parse(source);
  if (
    env.PUBLIC_BASE_URL === undefined ||
    env.FIELD_ENCRYPTION_KEYS === undefined ||
    env.FIELD_ENCRYPTION_ACTIVE_KEY_ID === undefined
  ) {
    return undefined;
  }
  const keys = dbCrypto.parseFieldEncryptionKeys(env.FIELD_ENCRYPTION_KEYS);
  if (!(env.FIELD_ENCRYPTION_ACTIVE_KEY_ID in keys)) return undefined;
  const google = pair(env.GOOGLE_CALENDAR_CLIENT_ID, env.GOOGLE_CALENDAR_CLIENT_SECRET);
  const microsoft = pair(env.MICROSOFT_CALENDAR_CLIENT_ID, env.MICROSOFT_CALENDAR_CLIENT_SECRET);
  return {
    providers: {
      ...(google === undefined ? {} : { google }),
      ...(microsoft === undefined ? {} : { microsoft }),
    },
    publicBaseUrl: env.PUBLIC_BASE_URL,
    appScheme: env.CALENDAR_OAUTH_APP_SCHEME ?? APP_SCHEMES[env.APP_ENV],
    keyring: { activeKeyId: env.FIELD_ENCRYPTION_ACTIVE_KEY_ID, keys },
  };
}

/** Decides whether a provider's connect flow is on for a user (the PostHog flag, default off). */
export type ProviderGate = (provider: OAuthCalendarProvider, uid: string) => Promise<boolean>;

/** A gate over evaluated flags (`evaluate` resolves the catalog for one user). */
export function flagGate(
  evaluate: (uid: string) => Promise<Readonly<Record<string, unknown>>>,
): ProviderGate {
  return async (provider, uid) => {
    try {
      return (await evaluate(uid))[calendarOAuthFlag(provider)] === true;
    } catch {
      return false;
    }
  };
}
