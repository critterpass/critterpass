/**
 * The device permission mirror: the store's picture of every kind folded into the
 * `update_device_permissions` payload, sent once per actual change (the last mirror sent is kept
 * in MMKV, so a relaunch with nothing changed sends nothing). The server derives from it whether
 * to push or keep things in the inbox, whether a Live Activity can start, and the crewmate-visible
 * capability ("alarm off") — never the raw list.
 */
import {
  devicePermissionStateSchema,
  PERMISSION_KINDS,
  permissionStatesEqual,
  type DevicePermissionState,
} from '@cp/domain';

import type { KeyValueStorage, PermissionsState } from './store';

export function buildMirror(state: PermissionsState): DevicePermissionState {
  const mirror: Record<string, unknown> = {};
  for (const kind of PERMISSION_KINDS) {
    const report = state.reports[kind];
    if (report?.available === true) mirror[kind] = report.status;
  }
  const location = state.reports.location;
  if (location?.level !== undefined) mirror['location_level'] = location.level;
  if (location?.precise !== undefined) mirror['location_precise'] = location.precise;
  const timeSensitive = state.reports.notifications?.timeSensitive;
  if (timeSensitive !== undefined) mirror['notifications_time_sensitive'] = timeSensitive;
  if (state.alarms !== null) {
    mirror['exact_alarm'] = state.alarms.exactAlarm;
    mirror['full_screen_intent'] = state.alarms.fullScreenIntent;
  }
  if (state.liveActivities !== null) {
    mirror['la_enabled'] = state.liveActivities.enabled;
    mirror['la_frequent'] = state.liveActivities.frequent;
  }
  return devicePermissionStateSchema.parse(mirror);
}

const LAST_SENT_KEY = 'mirror:last-sent';

export interface MirrorOptions {
  /** Queues `update_device_permissions {perms}` (offline-capable). */
  readonly send: (perms: DevicePermissionState) => Promise<unknown>;
  readonly storage: KeyValueStorage;
}

export function createMirror(options: MirrorOptions) {
  let chain: Promise<unknown> = Promise.resolve();

  function lastSent(): DevicePermissionState | null {
    const raw = options.storage.getString(LAST_SENT_KEY);
    if (raw === undefined) return null;
    try {
      const parsed = devicePermissionStateSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /** Sends the mirror for `state` unless it equals the last one sent; resolves true when sent. */
  function update(state: PermissionsState): Promise<boolean> {
    // Only once every kind has been read: a half-read picture would flap the server's copy.
    if (PERMISSION_KINDS.some((kind) => state.reports[kind] === undefined)) {
      return Promise.resolve(false);
    }
    const mirror = buildMirror(state);
    const next = chain.then(async () => {
      const previous = lastSent();
      if (previous !== null && permissionStatesEqual(previous, mirror)) return false;
      await options.send(mirror);
      options.storage.set(LAST_SENT_KEY, JSON.stringify(mirror));
      return true;
    });
    chain = next.catch(() => undefined);
    return next;
  }

  return { update };
}

export type PermissionMirror = ReturnType<typeof createMirror>;
