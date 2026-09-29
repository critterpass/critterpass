/**
 * Calendar sync configuration from the environment (names only in services/worker/.env.example):
 * the field encryption keyring the OAuth tokens are sealed with, and each provider's client id and
 * secret for refreshing access tokens. Unset keyring = OAuth calendars are not synced.
 */
import { crypto as dbCrypto } from '@cp/db';
import { z } from 'zod';

import type { CalendarSyncConfig } from './providers';

const optional = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  FIELD_ENCRYPTION_KEYS: optional,
  FIELD_ENCRYPTION_ACTIVE_KEY_ID: optional,
  GOOGLE_CALENDAR_CLIENT_ID: optional,
  GOOGLE_CALENDAR_CLIENT_SECRET: optional,
  MICROSOFT_CALENDAR_CLIENT_ID: optional,
  MICROSOFT_CALENDAR_CLIENT_SECRET: optional,
});

export function calendarSyncConfigFromEnv(
  source: Readonly<Record<string, string | undefined>>,
): CalendarSyncConfig | undefined {
  const env = envSchema.parse(source);
  if (env.FIELD_ENCRYPTION_KEYS === undefined || env.FIELD_ENCRYPTION_ACTIVE_KEY_ID === undefined) {
    return undefined;
  }
  const keys = dbCrypto.parseFieldEncryptionKeys(env.FIELD_ENCRYPTION_KEYS);
  if (!(env.FIELD_ENCRYPTION_ACTIVE_KEY_ID in keys)) return undefined;
  const pair = (id: string | undefined, secret: string | undefined) =>
    id !== undefined && secret !== undefined ? { clientId: id, clientSecret: secret } : undefined;
  const google = pair(env.GOOGLE_CALENDAR_CLIENT_ID, env.GOOGLE_CALENDAR_CLIENT_SECRET);
  const microsoft = pair(env.MICROSOFT_CALENDAR_CLIENT_ID, env.MICROSOFT_CALENDAR_CLIENT_SECRET);
  return {
    keyring: { activeKeyId: env.FIELD_ENCRYPTION_ACTIVE_KEY_ID, keys },
    providers: {
      ...(google === undefined ? {} : { google }),
      ...(microsoft === undefined ? {} : { microsoft }),
    },
  };
}
