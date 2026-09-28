/**
 * Status, request and Settings paths for every permission kind on both OSes. The native module
 * answers when linked; a binary built before it falls back to the Expo modules already linked for
 * notifications, location and photos.
 *
 * Nothing here decides *when* to ask: that is the orchestrator's job (src/lib/permissions), which
 * shows a primer first and only then calls `request`.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  PERMISSION_KINDS,
  type KindReport,
  type PermissionKind,
  type PermissionsBackend,
  type RequestLevel,
  type SettingsTarget,
} from './src/backend';
import { nativeCpPermissionsModule } from './src/CpPermissionsModule';
import { expoFallbackBackend } from './src/expo-fallback';
import { nativeBackend } from './src/native-backend';

export {
  PERMISSION_KINDS,
  unavailable,
  type KindReport,
  type LocationLevel,
  type PermissionKind,
  type PermissionsBackend,
  type PermissionStatus,
  type RequestLevel,
  type SettingsTarget,
} from './src/backend';

export interface PermissionSnapshot {
  readonly reports: Readonly<Record<PermissionKind, KindReport>>;
  readonly alarms: { readonly exactAlarm: boolean; readonly fullScreenIntent: boolean } | null;
  readonly liveActivities: { readonly enabled: boolean; readonly frequent: boolean } | null;
}

export interface AppStateSource {
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void };
}

export interface PermissionsApi {
  getStatus(kind: PermissionKind): Promise<KindReport>;
  request(kind: PermissionKind, level?: RequestLevel): Promise<KindReport>;
  requestTemporaryFullAccuracy(purposeKey: string): Promise<boolean>;
  snapshot(): Promise<PermissionSnapshot>;
  openSettings(target: SettingsTarget): Promise<boolean>;
  /** The Settings screen that can change `kind` on this platform. */
  settingsTargetFor(kind: PermissionKind): SettingsTarget;
  /**
   * Re-reads every kind whenever the app returns to the foreground (the user may have changed
   * something in Settings) and calls `listener` only when something actually changed.
   */
  watch(listener: (snapshot: PermissionSnapshot) => void, appState?: AppStateSource): () => void;
}

export function createPermissionsApi(
  backend: PermissionsBackend,
  platform: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios',
): PermissionsApi {
  async function snapshot(): Promise<PermissionSnapshot> {
    const list = await Promise.all(PERMISSION_KINDS.map((kind) => backend.getStatus(kind)));
    const reports = Object.fromEntries(list.map((r) => [r.kind, r])) as Record<
      PermissionKind,
      KindReport
    >;
    return {
      reports,
      alarms: backend.alarmCapabilities(),
      liveActivities: backend.liveActivities(),
    };
  }

  return {
    getStatus: (kind) => backend.getStatus(kind),
    request: (kind, level) => backend.request(kind, level),
    requestTemporaryFullAccuracy: (purposeKey) => backend.requestTemporaryFullAccuracy(purposeKey),
    snapshot,
    openSettings: (target) => backend.openSettings(target),
    settingsTargetFor(kind) {
      if (kind === 'notifications') return 'notifications';
      if (kind === 'alarms' && platform === 'android') return 'exact_alarm';
      if (kind === 'location') return 'location';
      return 'app';
    },
    watch(listener, appState = AppState) {
      let last: string | null = null;
      let reading = false;
      const read = async () => {
        if (reading) return;
        reading = true;
        try {
          const next = await snapshot();
          const key = JSON.stringify(next);
          if (key !== last) {
            last = key;
            listener(next);
          }
        } finally {
          reading = false;
        }
      };
      void read();
      const subscription = appState.addEventListener('change', (state) => {
        if (state === 'active') void read();
      });
      return () => subscription.remove();
    },
  };
}

export function defaultBackend(): PermissionsBackend {
  const platform = Platform.OS === 'android' ? 'android' : 'ios';
  return nativeCpPermissionsModule !== null
    ? nativeBackend(nativeCpPermissionsModule, platform)
    : expoFallbackBackend();
}

let shared: PermissionsApi | null = null;

/** The app-wide API over the best backend this binary has. */
export function getPermissions(): PermissionsApi {
  shared ??= createPermissionsApi(defaultBackend());
  return shared;
}
