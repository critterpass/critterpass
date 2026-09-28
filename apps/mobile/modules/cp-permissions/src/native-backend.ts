import type { KindReport, PermissionKind, PermissionsBackend } from './backend';
import type { NativeCpPermissionsModule, NativeKindResult } from './CpPermissionsModule';

function report(kind: PermissionKind, result: NativeKindResult): KindReport {
  return {
    kind,
    status: result.status,
    canAskAgain: result.canAskAgain,
    // A kind the OS lacks comes back `restricted` without a prompt, which reads the same as a
    // device-policy block: nothing the user can change from the app.
    available: true,
    ...(result.level !== undefined ? { level: result.level } : {}),
    ...(result.precise !== undefined ? { precise: result.precise } : {}),
    ...(result.timeSensitive !== undefined ? { timeSensitive: result.timeSensitive } : {}),
  };
}

export function nativeBackend(
  native: NativeCpPermissionsModule,
  platform: 'ios' | 'android',
): PermissionsBackend {
  return {
    async getStatus(kind) {
      return report(kind, await native.getStatus(kind));
    },
    async request(kind, level) {
      return report(kind, await native.request(kind, level ?? null));
    },
    requestTemporaryFullAccuracy: (purposeKey) => native.requestTemporaryFullAccuracy(purposeKey),
    alarmCapabilities: () => (platform === 'android' ? native.getAlarmCapabilities() : null),
    liveActivities: () => native.getLiveActivities(),
    async openSettings(target) {
      return native.openSettings(target);
    },
  };
}
