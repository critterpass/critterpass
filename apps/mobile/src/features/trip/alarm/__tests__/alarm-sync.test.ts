/**
 * The leave-by alarm sync: an alarm only for a leave-by I'm on while I'm not up; an "I'm up" from
 * anywhere (another phone, a widget) cancels the one this phone holds; a moved leave-by moves it;
 * the one snooze is gone from the rescheduled alarm; and only a real OS alarm is mirrored to the
 * server. The OS side is an in-memory alarm clock that records what it was asked to do.
 */
import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';
import type { MirrorAlarmStatePayload } from '@cp/domain';

import {
  AT_0248,
  baturLeaveBy,
  JORDAN,
  LEAVE_BY,
  MAYA,
  RIN,
  WINSTON,
} from '../../day-of/dev/bali-day';
import type { AlarmBackend, AlarmMode } from '../alarm-backends';
import type { AlarmText } from '../alarm-copy';
import { desiredAlarms, diffAlarms, dueAlarm, type HeldAlarm } from '../alarm-plan';
import { syncAlarms } from '../alarm-sync';

const TEXT: AlarmText = {
  eyebrow: 'Leave-by alarm · Batur',
  time: '03:10',
  title: 'Leave by 03:10 · Batur',
  subtitle: 'Pickup at the villa gate · 03:30',
  guideLine: 'Up!',
  labels: { imUp: "I'm up", slide: 'Slide', snooze: 'Snooze', snoozeNote: '', crewPinged: '' },
};

function clock(mode: AlarmMode = 'native') {
  const held = new Map<string, HeldAlarm>();
  const calls: string[] = [];
  const backend: AlarmBackend = {
    mode,
    list: () => Promise.resolve([...held.values()]),
    schedule: (alarm) => {
      calls.push(`schedule ${alarm.leaveById} ${alarm.fireAt.toISOString()}`);
      held.set(alarm.leaveById, {
        leaveById: alarm.leaveById,
        fireAt: alarm.fireAt,
        snoozeAllowed: alarm.snoozeAllowed,
      });
      return Promise.resolve(mode === 'in_app' ? null : `os-${alarm.leaveById}`);
    },
    cancel: (leaveById) => {
      calls.push(`cancel ${leaveById}`);
      held.delete(leaveById);
      return Promise.resolve();
    },
  };
  return { backend, held, calls };
}

function deps(backend: AlarmBackend, mirrored: MirrorAlarmStatePayload[]) {
  return {
    backend,
    text: () => TEXT,
    tint: () => tokens.guide.tokek,
    deviceId: '0192f000-0000-7000-8000-00000000d001',
    mirrored: [],
    mirror: (payload: MirrorAlarmStatePayload) => {
      mirrored.push(payload);
      return Promise.resolve();
    },
    log: () => undefined,
  };
}

describe('leave-by alarm sync', () => {
  it('holds no alarm for a member who is already up', () => {
    const up = baturLeaveBy({ up: [WINSTON, MAYA] });
    expect(desiredAlarms([up], AT_0248)).toEqual([]);
    const asleep = baturLeaveBy({ up: [MAYA] });
    expect(desiredAlarms([asleep], AT_0248).map((alarm) => alarm.fireAt.toISOString())).toEqual([
      '2026-10-14T19:00:00.000Z',
    ]);
  });

  it("holds none for a leave-by I'm not on, or one already past", () => {
    const notMine = baturLeaveBy({ participants: [MAYA, JORDAN, RIN], up: [] });
    expect(desiredAlarms([notMine], AT_0248)).toEqual([]);
    const late = new Date('2026-10-14T19:20:00Z');
    expect(desiredAlarms([baturLeaveBy({ now: late, up: [] })], late)).toEqual([]);
  });

  it('schedules, then cancels when I am up on another phone, and mirrors both', async () => {
    const os = clock();
    const mirrored: MirrorAlarmStatePayload[] = [];
    await syncAlarms(
      desiredAlarms([baturLeaveBy({ up: [MAYA] })], AT_0248),
      deps(os.backend, mirrored),
    );
    expect(os.calls).toEqual([`schedule ${LEAVE_BY} 2026-10-14T19:00:00.000Z`]);

    // My readiness row synced back as up (tapped on the watch): nothing is wanted any more.
    await syncAlarms(
      desiredAlarms([baturLeaveBy({ up: [MAYA, WINSTON] })], AT_0248),
      deps(os.backend, mirrored),
    );
    expect(os.calls.at(-1)).toBe(`cancel ${LEAVE_BY}`);
    expect(os.held.size).toBe(0);
    expect(mirrored.map((payload) => payload.state)).toEqual(['scheduled', 'cancelled']);
  });

  it('moves the alarm when the leave-by moves, and drops the snooze once it is used', async () => {
    const os = clock();
    const view = baturLeaveBy({ up: [MAYA] });
    await syncAlarms(desiredAlarms([view], AT_0248), deps(os.backend, []));
    const moved = { ...view, alarmAt: new Date('2026-10-14T18:55:00Z') };
    await syncAlarms(desiredAlarms([moved], AT_0248), deps(os.backend, []));
    expect(os.calls.at(-1)).toBe(`schedule ${LEAVE_BY} 2026-10-14T18:55:00.000Z`);

    const snoozed = baturLeaveBy({ up: [MAYA], snoozes: 1 });
    const again = desiredAlarms(
      [snoozed],
      AT_0248,
      new Map([[LEAVE_BY, new Date('2026-10-14T19:05:00Z')]]),
    );
    expect(again[0]?.snoozeAllowed).toBe(false);
    expect(diffAlarms(again, [...os.held.values()]).schedule).toHaveLength(1);
  });

  it("mirrors nothing when the app's own screen is the alarm", async () => {
    const os = clock('in_app');
    const mirrored: MirrorAlarmStatePayload[] = [];
    await syncAlarms(
      desiredAlarms([baturLeaveBy({ up: [] })], AT_0248),
      deps(os.backend, mirrored),
    );
    expect(mirrored).toEqual([]);
  });

  it('rings in the app between the alarm time and the leave-by, unless I am up', () => {
    const ringing = new Date('2026-10-14T19:02:00Z');
    expect(dueAlarm([baturLeaveBy({ now: ringing, up: [] })], ringing)?.id).toBe(LEAVE_BY);
    expect(dueAlarm([baturLeaveBy({ now: ringing, up: [WINSTON] })], ringing)).toBeNull();
    expect(dueAlarm([baturLeaveBy({ up: [] })], AT_0248)).toBeNull();
  });
});
