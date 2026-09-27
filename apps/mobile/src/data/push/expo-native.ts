/**
 * The real `PushNative` (./tokens.ts): `expo-notifications` for permission, the native device token
 * and rotation events, `expo-application` for the build's `aps-environment`. Not unit-tested — it
 * only forwards to native modules; the decisions built on it are tested against a fake.
 */
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';

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
