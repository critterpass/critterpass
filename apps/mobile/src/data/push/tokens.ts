/**
 * The native push token this install registers (docs/api-contracts.md §4.1 `register_device`): the
 * raw APNs device token on iOS and the FCM registration token on Android, never an Expo push token
 * — the server talks to APNs/FCM directly. Every native call goes through `PushNative`, a narrow
 * slice of `expo-notifications`/`expo-application` (wired in ./expo-native.ts), so the decisions
 * here are unit-testable against a fake boundary.
 */

export type PushPlatform = 'ios' | 'android';
export type ApnsEnv = 'sandbox' | 'prod';

export interface NativeDevicePushToken {
  readonly type: string;
  readonly data: string;
}

export interface PushPermission {
  readonly granted: boolean;
  /** iOS provisional authorisation still yields a token (quiet delivery). */
  readonly provisional: boolean;
}

export interface PushNative {
  getPermission(): Promise<PushPermission>;
  getDevicePushToken(): Promise<NativeDevicePushToken>;
  /** Fires when the OS rotates the token; returns an unsubscribe function. */
  onTokenChange(listener: (token: NativeDevicePushToken) => void): () => void;
  /** The `aps-environment` this build was signed with; `null` on Android or when unknown. */
  getApnsEnvironment(): Promise<'development' | 'production' | null>;
}

export interface PushTokenSnapshot {
  readonly token: string;
  readonly apnsEnv: ApnsEnv;
}

/** Development-signed builds get sandbox tokens; everything else (TestFlight, store) is production. */
export function toApnsEnv(environment: 'development' | 'production' | null): ApnsEnv {
  return environment === 'development' ? 'sandbox' : 'prod';
}

/** A token string worth sending: APNs hex or an FCM registration token, never blank. */
export function normaliseToken(token: NativeDevicePushToken): string | undefined {
  const value = token.data.trim();
  return value.length > 0 ? value : undefined;
}

/**
 * Reads the current token when the OS allows alerts (granted or provisional). `undefined` when
 * notifications are denied or the OS has no token to give yet (simulator without APNs, no Google
 * Play services): the device still registers, just without a token.
 */
export async function readPushToken(native: PushNative): Promise<PushTokenSnapshot | undefined> {
  const permission = await native.getPermission();
  if (!permission.granted && !permission.provisional) return undefined;
  let token: string | undefined;
  try {
    token = normaliseToken(await native.getDevicePushToken());
  } catch {
    return undefined;
  }
  if (token === undefined) return undefined;
  return { token, apnsEnv: toApnsEnv(await native.getApnsEnvironment()) };
}
