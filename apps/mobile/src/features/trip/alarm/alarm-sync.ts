/**
 * One pass of the alarm sync: compare what this phone should hold with what the OS holds, cancel
 * and schedule the difference, and mirror each change to the server (`mirror_alarm_state`) so it
 * knows whose phone has a real alarm and whose needs the remote copy. The app's own alarm screen
 * (`in_app`) schedules nothing and mirrors nothing, which is exactly what makes the server send
 * the remote copy.
 */
/* eslint-disable lingui/no-unlocalized-strings -- log events and wire states, never copy. */
import type { MirrorAlarmStatePayload } from '@cp/domain';

import type { AlarmBackend } from './alarm-backends';
import type { AlarmText } from './alarm-copy';
import { diffAlarms, type DesiredAlarm } from './alarm-plan';

export interface MirroredAlarm {
  readonly leaveById: string;
  readonly fireAt: string;
  readonly state: string;
}

export interface AlarmSyncDeps {
  readonly backend: AlarmBackend;
  readonly text: (alarm: DesiredAlarm) => AlarmText;
  readonly tint: (alarm: DesiredAlarm) => string;
  /** This install's device id; nothing is mirrored before it is known. */
  readonly deviceId: string | null;
  /** The alarm rows this device mirrored before (synced `alarms`). */
  readonly mirrored: readonly MirroredAlarm[];
  readonly mirror: (payload: MirrorAlarmStatePayload) => Promise<unknown>;
  readonly log: (event: string, detail: Readonly<Record<string, string | number>>) => void;
}

export interface AlarmSyncResult {
  readonly scheduled: readonly string[];
  readonly cancelled: readonly string[];
  readonly failed: readonly string[];
}

function sameInstant(a: string, b: Date): boolean {
  return Math.abs(new Date(a).getTime() - b.getTime()) < 1000;
}

export async function syncAlarms(
  desired: readonly DesiredAlarm[],
  deps: AlarmSyncDeps,
): Promise<AlarmSyncResult> {
  const { backend } = deps;
  const held = await backend.list();
  const changes = diffAlarms(desired, held);
  const mirrored = new Map(deps.mirrored.map((row) => [row.leaveById, row]));
  const mirror = async (
    leaveById: string,
    state: MirrorAlarmStatePayload['state'],
    fireAt: Date,
    osAlarmId?: string,
  ) => {
    if (deps.deviceId === null || backend.mode === 'in_app') return;
    const before = mirrored.get(leaveById);
    if (before !== undefined && before.state === state && sameInstant(before.fireAt, fireAt))
      return;
    await deps.mirror({
      device_id: deps.deviceId,
      leave_by_id: leaveById,
      state,
      fire_at: fireAt.toISOString(),
      ...(osAlarmId === undefined ? {} : { os_alarm_id: osAlarmId.slice(0, 128) }),
    });
  };

  const cancelled: string[] = [];
  const failed: string[] = [];
  for (const leaveById of changes.cancel) {
    try {
      await backend.cancel(leaveById);
      cancelled.push(leaveById);
      const was = held.find((alarm) => alarm.leaveById === leaveById);
      await mirror(leaveById, 'cancelled', was?.fireAt ?? new Date());
      deps.log('alarm.cancelled', { mode: backend.mode, leave_by_id: leaveById });
    } catch {
      failed.push(leaveById);
    }
  }
  const scheduled: string[] = [];
  for (const alarm of changes.schedule) {
    try {
      const osAlarmId = await backend.schedule(alarm, deps.text(alarm), deps.tint(alarm));
      scheduled.push(alarm.leaveById);
      if (osAlarmId !== null) await mirror(alarm.leaveById, 'scheduled', alarm.fireAt, osAlarmId);
      deps.log('alarm.scheduled', {
        mode: backend.mode,
        leave_by_id: alarm.leaveById,
        fire_at: alarm.fireAt.toISOString(),
      });
    } catch {
      failed.push(alarm.leaveById);
      deps.log('alarm.schedule_failed', { mode: backend.mode, leave_by_id: alarm.leaveById });
    }
  }
  // An alarm the OS already holds whose mirror was lost (a reinstall, a new device id).
  for (const alarm of desired) {
    if (scheduled.includes(alarm.leaveById) || failed.includes(alarm.leaveById)) continue;
    if (backend.mode === 'in_app') continue;
    await mirror(alarm.leaveById, 'scheduled', alarm.fireAt).catch(() => undefined);
  }
  return { scheduled, cancelled, failed };
}
