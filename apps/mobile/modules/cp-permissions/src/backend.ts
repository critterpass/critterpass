/**
 * The kinds and statuses this module speaks, mirroring `@cp/domain` `PERMISSION_KINDS` and
 * `PERMISSION_STATUSES` (native modules sit below the app's layers and import no workspace
 * package); the app's permission orchestrator checks the two lists agree.
 */
export const PERMISSION_KINDS = [
  'notifications',
  'alarms',
  'location',
  'calendar',
  'camera',
  'microphone',
  'speech',
  'photos_add',
  'photos_read',
  'live_activities',
] as const;
export type PermissionKind = (typeof PERMISSION_KINDS)[number];

export type PermissionStatus =
  'not_determined' | 'denied' | 'restricted' | 'limited' | 'provisional' | 'granted';

export type LocationLevel = 'none' | 'wiu' | 'always';

/** One kind's state as the app sees it. `available: false` = this build cannot ask for it. */
export interface KindReport {
  readonly kind: PermissionKind;
  readonly status: PermissionStatus;
  readonly canAskAgain: boolean;
  readonly available: boolean;
  readonly level?: LocationLevel;
  readonly precise?: boolean;
  readonly timeSensitive?: boolean;
}

export type SettingsTarget =
  'app' | 'notifications' | 'exact_alarm' | 'full_screen_intent' | 'location';

/** The level asked for: the Always location upgrade, or quiet (provisional) notifications. */
export type RequestLevel = 'always' | 'provisional';

export interface PermissionsBackend {
  getStatus(kind: PermissionKind): Promise<KindReport>;
  request(kind: PermissionKind, level?: RequestLevel): Promise<KindReport>;
  requestTemporaryFullAccuracy(purposeKey: string): Promise<boolean>;
  /** Android exact alarms and full-screen intents; null where the platform has neither. */
  alarmCapabilities(): { readonly exactAlarm: boolean; readonly fullScreenIntent: boolean } | null;
  liveActivities(): { readonly enabled: boolean; readonly frequent: boolean } | null;
  openSettings(target: SettingsTarget): Promise<boolean>;
}

export function unavailable(kind: PermissionKind): KindReport {
  return { kind, status: 'restricted', canAskAgain: false, available: false };
}
