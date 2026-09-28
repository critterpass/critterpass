import { describe, expect, it } from '@jest/globals';
import { PERMISSION_KINDS, type DevicePermissionState, type PermissionKind } from '@cp/domain';

import { createPermissionStore, type KeyValueStorage, type PermissionReport } from '../store';
import {
  applyPermissionsSnapshot,
  configurePermissions,
  registerPrimerPresenter,
  requestWithPrimer,
} from '../use-permission';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => data.delete(key),
  };
}

const reportFor = (kind: PermissionKind, status: PermissionReport['status']): PermissionReport => ({
  kind,
  status,
  canAskAgain: true,
  available: true,
});

describe('configured permissions', () => {
  it('mirrors a snapshot once and again after a primer changes a kind', async () => {
    const os = new Map<PermissionKind, PermissionReport>(
      PERMISSION_KINDS.map((kind) => [kind, reportFor(kind, 'not_determined')]),
    );
    const sent: DevicePermissionState[] = [];
    configurePermissions({
      port: {
        getStatus: (kind) => Promise.resolve(os.get(kind) ?? reportFor(kind, 'not_determined')),
        request(kind) {
          os.set(kind, reportFor(kind, 'granted'));
          return Promise.resolve(reportFor(kind, 'granted'));
        },
        openSettings: () => Promise.resolve(true),
        settingsTargetFor: () => 'app',
      },
      sendMirror: (perms) => {
        sent.push(perms);
        return Promise.resolve();
      },
      storage: memoryStorage(),
      store: createPermissionStore(memoryStorage()),
    });
    const snapshot = {
      reports: Object.fromEntries(os) as Record<PermissionKind, PermissionReport>,
      alarms: null,
      liveActivities: null,
    };
    expect(await applyPermissionsSnapshot(snapshot)).toBe(true);
    expect(await applyPermissionsSnapshot(snapshot)).toBe(false);

    const stop = registerPrimerPresenter(() => Promise.resolve('accept'));
    const outcome = await requestWithPrimer('camera', 'real_photo');
    stop();
    expect(outcome.result).toBe('granted');
    expect(sent.map((perms) => perms.camera)).toEqual(['not_determined', 'granted']);
    expect((await requestWithPrimer('calendar', 'date_finding')).result).toBe('suppressed');
  });
});
