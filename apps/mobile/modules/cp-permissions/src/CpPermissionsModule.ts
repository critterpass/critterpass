import { NativeModule, requireOptionalNativeModule } from 'expo';

/** What the native side reports for one kind (Swift `StatusMapping` / Kotlin `StatusMapping`). */
export interface NativeKindResult {
  readonly status:
    'not_determined' | 'denied' | 'restricted' | 'limited' | 'provisional' | 'granted';
  readonly canAskAgain: boolean;
  readonly level?: 'none' | 'wiu' | 'always';
  readonly precise?: boolean;
  readonly timeSensitive?: boolean;
}

/**
 * The native binding (Swift `CpPermissionsModule` / Kotlin `CpPermissionsModule`).
 * `requireOptionalNativeModule` resolves to `null` in a build without it (Jest, or a binary built
 * before the module existed); the JS API then falls back to the Expo modules already linked.
 */
export declare class NativeCpPermissionsModule extends NativeModule {
  getStatus(kind: string): Promise<NativeKindResult>;
  /** `level`: `always` for the location upgrade, `provisional` for quiet notifications. */
  request(kind: string, level: string | null): Promise<NativeKindResult>;
  requestTemporaryFullAccuracy(purposeKey: string): Promise<boolean>;
  getAlarmCapabilities(): { exactAlarm: boolean; fullScreenIntent: boolean };
  getLiveActivities(): { enabled: boolean; frequent: boolean };
  openSettings(target: string): Promise<boolean> | boolean;
}

export const nativeCpPermissionsModule =
  requireOptionalNativeModule<NativeCpPermissionsModule>('CpPermissions');
