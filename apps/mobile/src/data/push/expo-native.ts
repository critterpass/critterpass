/**
 * The real `PushNative` (./tokens.ts): `expo-notifications` for permission, the native device token
 * and rotation events, `expo-application` for the build's `aps-environment`. Not unit-tested — it
 * only forwards to native modules; the decisions built on it are tested against a fake.
 */
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { ACTION_KEY_KEYCHAIN, type ActionKeyStorage } from './action-key';
import type { InstallIdStorage } from './register';
import type { NativeDevicePushToken, PushNative } from './tokens';

function asNativeToken(token: Notifications.DevicePushToken): NativeDevicePushToken {
  return { type: token.type, data: typeof token.data === 'string' ? token.data : '' };
}

export const expoPushNative: PushNative = {
  async getPermission() {
    const status = await Notifications.getPermissionsAsync();
    return {
      granted: status.granted,
      provisional: status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL,
    };
  },
  async getDevicePushToken() {
    return asNativeToken(await Notifications.getDevicePushTokenAsync());
  },
  onTokenChange(listener) {
    const subscription = Notifications.addPushTokenListener((token) =>
      listener(asNativeToken(token)),
    );
    return () => subscription.remove();
  },
  async getApnsEnvironment() {
    // iOS only; Android has no APNs environment and the call rejects there.
    try {
      return await Application.getIosPushNotificationServiceEnvironmentAsync();
    } catch {
      return null;
    }
  },
};

/** The install id stays on this device only (`WHEN_UNLOCKED_THIS_DEVICE_ONLY` never syncs it). */
export const secureInstallIdStorage: InstallIdStorage = {
  getItemAsync: (key) =>
    SecureStore.getItemAsync(key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  setItemAsync: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
};

/**
 * The shared-group Keychain item extensions read. `AFTER_FIRST_UNLOCK` so a notification action
 * or the notification service extension can still sign while the phone is locked.
 */
const actionKeyOptions: SecureStore.SecureStoreOptions = {
  keychainService: ACTION_KEY_KEYCHAIN.keychainService,
  accessGroup: ACTION_KEY_KEYCHAIN.accessGroup,
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export const secureActionKeyStorage: ActionKeyStorage = {
  read: () => SecureStore.getItemAsync(ACTION_KEY_KEYCHAIN.account, actionKeyOptions),
  write: (value) => SecureStore.setItemAsync(ACTION_KEY_KEYCHAIN.account, value, actionKeyOptions),
  remove: () => SecureStore.deleteItemAsync(ACTION_KEY_KEYCHAIN.account, actionKeyOptions),
};

/** Android: the key's record beside the Keystore (never the secret; see `android-surfaces.ts`). */
export const secureActionKeyRecord: ActionKeyStorage = {
  read: () => SecureStore.getItemAsync(ACTION_KEY_KEYCHAIN.account),
  write: (value) => SecureStore.setItemAsync(ACTION_KEY_KEYCHAIN.account, value),
  remove: () => SecureStore.deleteItemAsync(ACTION_KEY_KEYCHAIN.account),
};
