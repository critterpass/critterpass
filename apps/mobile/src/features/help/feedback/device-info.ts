/** What "Include device info" sends: the OS, the app's version and build, the model and locale. */
import type { FeedbackDeviceInfo } from '@cp/domain';
import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import { modelName, osVersion } from 'expo-device';
import { getNetworkStateAsync, NetworkStateType } from 'expo-network';
import { Platform } from 'react-native';

const OS_NAMES: Readonly<Record<string, string>> = { ios: 'iOS', android: 'Android' };

export function deviceInfoNow(locale: string): FeedbackDeviceInfo {
  return {
    os: OS_NAMES[Platform.OS] ?? Platform.OS,
    os_version: osVersion ?? '',
    app_version: nativeApplicationVersion ?? '0',
    build: nativeBuildVersion ?? '',
    model: modelName ?? '',
    locale,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    network: 'unknown',
  };
}

/** The same, with the kind of connection it was sent over. */
export async function deviceInfoWithNetwork(locale: string): Promise<FeedbackDeviceInfo> {
  const info = deviceInfoNow(locale);
  try {
    const state = await getNetworkStateAsync();
    const network =
      state.isConnected !== true
        ? 'none'
        : state.type === NetworkStateType.WIFI
          ? 'wifi'
          : state.type === NetworkStateType.CELLULAR
            ? 'cellular'
            : 'unknown';
    return { ...info, network };
  } catch {
    return info;
  }
}
