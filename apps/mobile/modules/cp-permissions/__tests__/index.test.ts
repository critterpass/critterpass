import { describe, expect, it } from '@jest/globals';
import type { AppStateStatus } from 'react-native';

import {
  createPermissionsApi,
  unavailable,
  type AppStateSource,
  type KindReport,
  type PermissionKind,
  type PermissionsBackend,
} from '../index';
import type { NativeCpPermissionsModule, NativeKindResult } from '../src/CpPermissionsModule';
import { nativeBackend } from '../src/native-backend';

/** A device whose OS answers from a mutable table (the native module is the boundary here). */
function fakeDevice(initial: Partial<Record<PermissionKind, Partial<KindReport>>> = {}) {
  const table = new Map<PermissionKind, KindReport>();
  const read = (kind: PermissionKind): KindReport => {
    const override = initial[kind];
    return (
      table.get(kind) ?? {
        kind,
        status: 'not_determined',
        canAskAgain: true,
        available: true,
        ...override,
      }
    );
  };
  const backend: PermissionsBackend = {
    getStatus: (kind) => Promise.resolve(read(kind)),
    request: (kind) => Promise.resolve(read(kind)),
    requestTemporaryFullAccuracy: () => Promise.resolve(true),
    alarmCapabilities: () => ({ exactAlarm: false, fullScreenIntent: true }),
    liveActivities: () => ({ enabled: true, frequent: false }),
    openSettings: () => Promise.resolve(true),
  };
  return {
    backend,
    set(kind: PermissionKind, report: Partial<KindReport>) {
      table.set(kind, { ...read(kind), ...report });
    },
  };
}

function fakeAppState() {
  let listener: ((state: AppStateStatus) => void) | null = null;
  const source: AppStateSource = {
    addEventListener(_type, next) {
      listener = next;
      return { remove: () => (listener = null) };
    },
  };
  return { source, emit: (state: AppStateStatus) => listener?.(state), active: () => listener };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('cp-permissions API', () => {
  it('reads every kind plus alarm and Live Activity capability', async () => {
    const device = fakeDevice({
      notifications: { status: 'provisional', timeSensitive: true },
      location: { status: 'granted', level: 'wiu', precise: false },
      live_activities: unavailable('live_activities'),
    });
    const api = createPermissionsApi(device.backend, 'android');
    const { reports, alarms, liveActivities } = await api.snapshot();
    expect(reports.camera.status).toBe('not_determined');
    expect(reports.notifications).toMatchObject({ status: 'provisional', timeSensitive: true });
    expect(reports.location).toMatchObject({ level: 'wiu', precise: false });
    expect(reports.live_activities.available).toBe(false);
    expect(alarms).toEqual({ exactAlarm: false, fullScreenIntent: true });
    expect(liveActivities).toEqual({ enabled: true, frequent: false });
  });

  it('emits on start and then only when the foreground re-read changed something', async () => {
    const device = fakeDevice();
    const app = fakeAppState();
    const api = createPermissionsApi(device.backend, 'ios');
    const seen: string[] = [];
    const stop = api.watch((s) => seen.push(s.reports.camera.status), app.source);
    await flush();
    app.emit('active');
    await flush();
    app.emit('background');
    device.set('camera', { status: 'denied', canAskAgain: false });
    app.emit('active');
    await flush();
    expect(seen).toEqual(['not_determined', 'denied']);
    stop();
    expect(app.active()).toBeNull();
  });

  it('points each kind at the Settings screen that can change it', () => {
    const android = createPermissionsApi(fakeDevice().backend, 'android');
    const ios = createPermissionsApi(fakeDevice().backend, 'ios');
    expect(android.settingsTargetFor('alarms')).toBe('exact_alarm');
    expect(ios.settingsTargetFor('alarms')).toBe('app');
    expect(ios.settingsTargetFor('notifications')).toBe('notifications');
    expect(ios.settingsTargetFor('location')).toBe('location');
    expect(ios.settingsTargetFor('camera')).toBe('app');
  });
});

describe('native backend', () => {
  function fakeNative(result: NativeKindResult) {
    const calls: [string, string | null][] = [];
    const native = {
      getStatus: (kind: string) => {
        calls.push([kind, null]);
        return Promise.resolve(result);
      },
      request: (kind: string, level: string | null) => {
        calls.push([kind, level]);
        return Promise.resolve(result);
      },
      requestTemporaryFullAccuracy: () => Promise.resolve(true),
      getAlarmCapabilities: () => ({ exactAlarm: true, fullScreenIntent: false }),
      getLiveActivities: () => ({ enabled: false, frequent: false }),
      openSettings: () => true,
    } as unknown as NativeCpPermissionsModule;
    return { native, calls };
  }

  it('passes the requested level through and keeps location detail', async () => {
    const { native, calls } = fakeNative({
      status: 'granted',
      canAskAgain: false,
      level: 'always',
      precise: true,
    });
    const backend = nativeBackend(native, 'ios');
    const report = await backend.request('location', 'always');
    expect(calls).toEqual([['location', 'always']]);
    expect(report).toEqual({
      kind: 'location',
      status: 'granted',
      canAskAgain: false,
      available: true,
      level: 'always',
      precise: true,
    });
    await backend.request('camera');
    expect(calls.at(-1)).toEqual(['camera', null]);
    expect(backend.alarmCapabilities()).toBeNull();
    expect(await backend.openSettings('app')).toBe(true);
  });

  it('reports exact-alarm capability on Android only', () => {
    const { native } = fakeNative({ status: 'granted', canAskAgain: false });
    expect(nativeBackend(native, 'android').alarmCapabilities()).toEqual({
      exactAlarm: true,
      fullScreenIntent: false,
    });
  });
});
