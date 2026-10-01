/**
 * The envelope's `device` block (docs/api-contracts.md §2.1): the install's one id (the same id
 * `register_device` creates the `devices` row under, ../push/register.ts), the platform, the app
 * version and the device's IANA time zone. Also makes Web Crypto's
 * `getRandomValues` available on React Native (from expo-crypto) for UUIDv7 op ids.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a storage key, a wire value or a device-log line, never copy. */
import { canonicalTz, generateUuidV7, isIanaTimeZone, type CommandDevice } from '@cp/domain';
import Constants from 'expo-constants';
import { getRandomValues } from 'expo-crypto';
import { getCalendars } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  getOrCreateInstallId,
  type InstallIdSource,
  type InstallIdStorage,
} from '../push/register';

/** A Keychain/Keystore-shaped store; the real one (expo-secure-store) takes per-item options. */
export interface DeviceIdStore {
  getItemAsync(key: string, options?: SecureStore.SecureStoreOptions): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: SecureStore.SecureStoreOptions): Promise<void>;
}

/** How `register_device` has always written the install id: never synced off this device. */
const INSTALL_ITEM_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** One view per store, so everyone reading the id through a store shares its single resolution. */
const views = new WeakMap<DeviceIdStore, InstallIdStorage>();

/**
 * `store` as every reader of the install id must use it: an item is looked for the way
 * `register_device` wrote it and then with the store's defaults (how earlier builds wrote the
 * envelope's id), so neither item can be missed over its options and a second id minted.
 */
export function installIdStorage(store: DeviceIdStore): InstallIdStorage {
  let view = views.get(store);
  if (view === undefined) {
    view = {
      getItemAsync: async (key) =>
        (await store.getItemAsync(key, INSTALL_ITEM_OPTIONS)) ?? store.getItemAsync(key),
      setItemAsync: (key, value) => store.setItemAsync(key, value, INSTALL_ITEM_OPTIONS),
    };
    views.set(store, view);
  }
  return view;
}

/** The device's own Keychain/Keystore, for the push registration and the command envelope alike. */
export const installIdKeychain: InstallIdStorage = installIdStorage(SecureStore);

const reported = new Set<InstallIdSource>();

/** Says once per launch where the id came from; a newly minted id is a warning. */
function reportInstallIdSource(source: InstallIdSource): void {
  if (reported.has(source)) return;
  reported.add(source);
  if (source === 'minted') console.warn('[install-id] minted a new install id');
  else console.info(`[install-id] using the ${source} install id`);
}

/** The install's id, created on first use: one id for the envelope and for `register_device`. */
export function loadOrCreateDeviceId(store: DeviceIdStore, newId: () => string): Promise<string> {
  return getOrCreateInstallId(installIdStorage(store), newId, reportInstallIdSource);
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
