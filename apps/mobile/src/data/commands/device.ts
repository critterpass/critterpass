/**
 * The envelope's `device` block (docs/api-contracts.md §2.1): a per-install id kept in secure
 * storage, the platform, the app version and the device's IANA time zone. Also makes Web Crypto's
 * `getRandomValues` available on React Native (from expo-crypto) for UUIDv7 op ids.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a storage key or wire value, never copy. */
import { generateUuidV7, type CommandDevice } from '@cp/domain';
import Constants from 'expo-constants';
import { getRandomValues } from 'expo-crypto';
import { getCalendars } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const DEVICE_ID_ITEM = 'cp.device.id';

export interface DeviceIdStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

/** The install's device id, created on first use. */
export async function loadOrCreateDeviceId(
  store: DeviceIdStore,
  newId: () => string,
): Promise<string> {
  const existing = await store.getItemAsync(DEVICE_ID_ITEM);
  if (existing !== null && existing.length > 0) return existing;
  const id = newId();
  await store.setItemAsync(DEVICE_ID_ITEM, id);
  return id;
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
      tz: getCalendars()[0]?.timeZone ?? 'UTC',
    };
  };
}
