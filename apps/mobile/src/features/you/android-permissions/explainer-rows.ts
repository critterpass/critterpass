/**
 * Which settings rows the Android surfaces offer, in the order they matter on a trip day: the
 * leave-by alarm first (exact time, then full screen), then the SOS through Do Not Disturb, then
 * Live Updates on the lock screen. With notifications off only that row shows: nothing else can
 * reach the person until it is on. The native module decides which limits apply on this Android
 * version; this only orders them and drops ids an older binary might not know. The module is
 * looked up by name (features never import native modules), so the shapes are restated here.
 */

/* eslint-disable lingui/no-unlocalized-strings -- wire ids from the native module, never shown. */

/** A limit the person can lift in system settings (modules/cp-android-surfaces `SettingsBanner`). */
export type SettingsBanner =
  'notifications' | 'exact_alarm' | 'full_screen_intent' | 'promoted' | 'dnd_access';

/** The native module's `permissionState()` (modules/cp-android-surfaces). */
export interface SurfacePermissionState {
  readonly sdkInt: number;
  readonly notifications: boolean;
  readonly exactAlarm: boolean;
  readonly fullScreenIntent: boolean;
  readonly promoted: boolean;
  readonly dndAccess: boolean;
  readonly sosBypassesDnd: boolean;
  readonly alarmPath: 'full_screen_exact' | 'heads_up_exact' | 'heads_up_inexact' | 'in_app_only';
  readonly sosPath: 'bypass_dnd' | 'high_respects_dnd' | 'in_app_only';
  readonly liveUpdatePath: 'promoted' | 'ongoing' | 'none';
  readonly banners: readonly SettingsBanner[];
}

export const EXPLAINER_ORDER: readonly SettingsBanner[] = [
  'notifications',
  'exact_alarm',
  'full_screen_intent',
  'dnd_access',
  'promoted',
];

export function explainerRows(state: SurfacePermissionState | null): SettingsBanner[] {
  if (state === null) return [];
  if (!state.notifications) return ['notifications'];
  return EXPLAINER_ORDER.filter(
    (banner) => banner !== 'notifications' && state.banners.includes(banner),
  );
}
