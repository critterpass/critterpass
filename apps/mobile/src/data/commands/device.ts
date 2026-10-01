/**
 * The envelope's `device` block (docs/api-contracts.md §2.1): the install's one id (the same id
 * `register_device` creates the `devices` row under, ../push/register.ts), the platform, the app
 * version and the device's IANA time zone. Also makes Web Crypto's
 * `getRandomValues` available on React Native (from expo-crypto) for UUIDv7 op ids.
 */
import { canonicalTz, generateUuidV7, isIanaTimeZone, type CommandDevice } from '@cp/domain';
import Constants from 'expo-constants';
import { getRandomValues } from 'expo-crypto';
import { getCalendars } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getOrCreateInstallId, type InstallIdStorage } from '../push/register';

export type DeviceIdStore = InstallIdStorage;

/** The install's id, created on first use: one id for the envelope and for `register_device`. */
export function loadOrCreateDeviceId(store: DeviceIdStore, newId: () => string): Promise<string> {
  return getOrCreateInstallId(store, newId);
}

/** Hermes has no Web Crypto; `generateUuidV7` needs `crypto.getRandomValues`. */
export function installRandomValues(): void {
  const scope = globalThis as { crypto?: Partial<Crypto> };
  if (typeof scope.crypto?.getRandomValues === 'function') return;
  scope.crypto = { ...scope.crypto, getRandomValues: getRandomValues as Crypto['getRandomValues'] };
}

function platform(): CommandDevice['platform'] {
  if (Platform.OS === 'ios' || Platform.OS === 'android') return Platform.OS;
  return 'web';
}

/**
 * The zone the envelope carries: the canonical IANA id of what the OS reports (an iOS simulator
 * on a UTC host says `GMT`, older devices say `Asia/Saigon`), or `UTC` when the OS reports
 * something that is no IANA zone at all (a custom `GMT+0700` offset), so no command is refused
 * for the device's clock settings.
 */
export function deviceTimeZone(reported: string | null | undefined): string {
  if (reported === null || reported === undefined || !isIanaTimeZone(reported)) return 'UTC';
  return canonicalTz(reported);
}

/** Resolves (and caches) the device block for every envelope this install sends. */
export function createDeviceResolver(): () => Promise<CommandDevice> {
  installRandomValues();
  let id: Promise<string> | null = null;
  return async () => {
    id ??= loadOrCreateDeviceId(SecureStore, generateUuidV7);
    return {
      id: await id,
      platform: platform(),
      app_version: Constants.expoConfig?.version ?? '0.0.0',
      tz: deviceTimeZone(getCalendars()[0]?.timeZone),
    };
  };
}
