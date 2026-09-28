/**
 * The backend for a binary built before the native module existed: notifications, location and
 * the photo library through the Expo modules already linked; every other kind reports itself
 * unavailable rather than pretending to know.
 */
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import {
  unavailable,
  type KindReport,
  type PermissionKind,
  type PermissionsBackend,
  type PermissionStatus,
} from './backend';

interface ExpoResponse {
  readonly status: string;
  readonly canAskAgain: boolean;
}

function statusOf(response: ExpoResponse): PermissionStatus {
  if (response.status === 'granted') return 'granted';
  return response.status === 'undetermined' ? 'not_determined' : 'denied';
}

function base(kind: PermissionKind, response: ExpoResponse): KindReport {
  const status = statusOf(response);
  return {
    kind,
    status,
    canAskAgain: status === 'not_determined' ? true : response.canAskAgain,
    available: true,
  };
}

async function notifications(ask: boolean): Promise<KindReport> {
  const response = ask
    ? await Notifications.requestPermissionsAsync()
    : await Notifications.getPermissionsAsync();
  const report = base('notifications', response);
  return response.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ? { ...report, status: 'provisional', canAskAgain: true }
    : report;
}

async function location(ask: boolean, always: boolean): Promise<KindReport> {
  if (ask && always) await Location.requestBackgroundPermissionsAsync();
  const foreground =
    ask && !always
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
  const report = base('location', foreground);
  if (report.status !== 'granted') return { ...report, level: 'none' };
  const background = await Location.getBackgroundPermissionsAsync();
  const isAlways = background.status === Location.PermissionStatus.GRANTED;
  const accuracy = foreground.android?.accuracy;
  return {
    ...report,
    canAskAgain: !isAlways && background.canAskAgain,
    level: isAlways ? 'always' : 'wiu',
    ...(accuracy !== undefined ? { precise: accuracy === 'fine' } : {}),
  };
}

async function photos(kind: 'photos_add' | 'photos_read', ask: boolean): Promise<KindReport> {
  const writeOnly = kind === 'photos_add';
  const response = ask
    ? await MediaLibrary.requestPermissionsAsync(writeOnly)
    : await MediaLibrary.getPermissionsAsync(writeOnly);
  const report = base(kind, response);
  // The native answer carries `accessPrivileges` even where the typed response omits it.
  const privileges = (response as { readonly accessPrivileges?: string }).accessPrivileges;
  return privileges === 'limited' ? { ...report, status: 'limited' } : report;
}

function route(kind: PermissionKind, ask: boolean, always: boolean): Promise<KindReport> {
  switch (kind) {
    case 'notifications':
      return notifications(ask);
    case 'location':
      return location(ask, always);
    case 'photos_add':
    case 'photos_read':
      return photos(kind, ask);
    case 'alarms':
    case 'calendar':
    case 'camera':
    case 'microphone':
    case 'speech':
    case 'live_activities':
      return Promise.resolve(unavailable(kind));
  }
}

export function expoFallbackBackend(): PermissionsBackend {
  return {
    getStatus: (kind) => route(kind, false, false),
    request: (kind, level) => route(kind, true, level === 'always'),
    requestTemporaryFullAccuracy: () => Promise.resolve(false),
    alarmCapabilities: () => null,
    liveActivities: () => null,
    async openSettings() {
      await Linking.openSettings();
      return true;
    },
  };
}
