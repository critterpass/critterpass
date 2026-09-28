import { describe, expect, it } from '@jest/globals';
import { PERMISSION_KINDS, type DevicePermissionState, type PermissionKind } from '@cp/domain';

import { buildMirror, createMirror } from '../mirror';
import type { KeyValueStorage, PermissionReport, PermissionsState } from '../store';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getString: (key) => data.get(key),
    set: (key, value) => void data.set(key, value),
    remove: (key) => data.delete(key),
  };
}

function stateWith(
  over: Partial<Record<PermissionKind, Partial<PermissionReport>>>,
): PermissionsState {
  const reports = Object.fromEntries(
    PERMISSION_KINDS.map((kind) => [
      kind,
      { kind, status: 'not_determined', canAskAgain: true, available: true, ...over[kind] },
    ]),
  ) as Record<PermissionKind, PermissionReport>;
  return { reports, alarms: { exactAlarm: true, fullScreenIntent: false }, liveActivities: null };
}

describe('permission mirror', () => {
  it('folds every available kind and capability into the payload', () => {
    const mirror = buildMirror(
      stateWith({
        location: { status: 'granted', level: 'always', precise: true },
        notifications: { status: 'provisional', timeSensitive: false },
        live_activities: { available: false, status: 'restricted' },
      }),
    );
    expect(mirror).toMatchObject({
      location: 'granted',
      location_level: 'always',
      location_precise: true,
      notifications: 'provisional',
      notifications_time_sensitive: false,
      exact_alarm: true,
      full_screen_intent: false,
    });
    expect(mirror).not.toHaveProperty('live_activities');
    expect(mirror).not.toHaveProperty('la_enabled');
  });

  it('sends exactly one command per change, persisted across restarts', async () => {
    const storage = memoryStorage();
    const sent: DevicePermissionState[] = [];
    const send = (perms: DevicePermissionState) => {
      sent.push(perms);
      return Promise.resolve();
    };
    const mirror = createMirror({ send, storage });
    const first = stateWith({ camera: { status: 'granted' } });
    const results = await Promise.all([mirror.update(first), mirror.update(first)]);
    expect(results).toEqual([true, false]);
    expect(await mirror.update(stateWith({ camera: { status: 'granted' } }))).toBe(false);
    expect(await mirror.update(stateWith({ camera: { status: 'denied' } }))).toBe(true);
    expect(sent.map((perms) => perms.camera)).toEqual(['granted', 'denied']);

    const relaunched = createMirror({ send, storage });
    expect(await relaunched.update(stateWith({ camera: { status: 'denied' } }))).toBe(false);
    expect(sent).toHaveLength(2);
  });

  it('waits until every kind was read, and retries a failed send next time', async () => {
    const storage = memoryStorage();
    let fail = true;
    const sent: DevicePermissionState[] = [];
    const mirror = createMirror({
      storage,
      send: (perms) => {
        if (fail) return Promise.reject(new Error('offline'));
        sent.push(perms);
        return Promise.resolve();
      },
    });
    expect(await mirror.update({ reports: {}, alarms: null, liveActivities: null })).toBe(false);
    await expect(mirror.update(stateWith({}))).rejects.toThrow('offline');
    fail = false;
    expect(await mirror.update(stateWith({}))).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
