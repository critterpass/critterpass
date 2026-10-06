import { NativeModule, requireOptionalNativeModule } from 'expo';

/** The device action key as the Keystore holds it (never the secret, which cannot be read back). */
export interface NativeActionKeyInfo {
  readonly keyId: string;
  readonly scopes: readonly string[];
  readonly expiresAtMs: number;
  /** The key lives in a TEE or StrongBox. */
  readonly secureHardware: boolean;
}

/** A settings row the app can offer; each opens the page that lifts that limit. */
export type NativeSettingsBanner =
  'notifications' | 'exact_alarm' | 'full_screen_intent' | 'promoted' | 'dnd_access';

/** What the device lets the surfaces do, and how each surface degrades without it. */
export interface NativeSurfacePermissionState {
  readonly sdkInt: number;
  readonly notifications: boolean;
  readonly exactAlarm: boolean;
  readonly fullScreenIntent: boolean;
  /** Live Updates may be promoted (API 36+ and the user left it on). */
  readonly promoted: boolean;
  /** Notification-policy access (SOS through Do Not Disturb). */
  readonly dndAccess: boolean;
  readonly sosBypassesDnd: boolean;
  readonly alarmPath: 'full_screen_exact' | 'heads_up_exact' | 'heads_up_inexact' | 'in_app_only';
  readonly sosPath: 'bypass_dnd' | 'high_respects_dnd' | 'in_app_only';
  readonly liveUpdatePath: 'promoted' | 'ongoing' | 'none';
  readonly banners: readonly NativeSettingsBanner[];
}

export interface NativeWidgetSupport {
  /** The launcher can pin a widget from the app. */
  readonly pin: boolean;
  /** The lock-screen widget hub exists on this device. */
  readonly keyguard: boolean;
  /** The sleepy-clock screen saver (runs only while charging). */
  readonly dream: boolean;
}

export interface NativeInstalledWidget {
  readonly kind: string;
  readonly family: 'android';
}

/**
 * The Kotlin `CpAndroidSurfacesModule`. `requireOptionalNativeModule` answers `null` on iOS, in
 * Jest and in a binary built before the module existed; every caller then skips the Android
 * surfaces.
 */
export declare class NativeCpAndroidSurfacesModule extends NativeModule {
  /** Imports the issued key JSON (`StoredActionKey`) as a non-exportable Keystore HMAC key. */
  importActionKey(json: string): Promise<boolean>;
  revokeActionKey(): void;
  actionKeyInfo(): NativeActionKeyInfo | null;
  /** Sends whatever surfaces queued in the outbox as soon as the network allows. */
  drainActions(): void;
  permissionState(): NativeSurfacePermissionState;
  /** `channel` needs `channelId`; false when this Android has no such settings page. */
  openSettings(banner: NativeSettingsBanner | 'channel', channelId: string | null): boolean;
  /** The channel's importance (0 when the user blocked it). */
  channelImportance(channelId: string): number;
  widgetSupport(): NativeWidgetSupport;
  /** Asks the launcher to pin the widget; false when it cannot (show the how-to sheet). */
  requestPinWidget(kind: string): boolean;
  installedWidgets(): NativeInstalledWidget[];
}

export const nativeCpAndroidSurfacesModule =
  requireOptionalNativeModule<NativeCpAndroidSurfacesModule>('CpAndroidSurfaces');
