/**
 * Which leave-by alarms this phone should hold, and what to change to get there. An alarm is held
 * only for a leave-by I'm on, while I'm not up, before it is due; being up anywhere (the app, the
 * alarm, a widget, another phone) cancels it, and a moved leave-by moves it. Pure, so the sync and
 * its tests agree on the rules.
 */
import type { LeaveByDeadline, LeaveByView } from '../leave-by/model';

export interface DesiredAlarm {
  readonly leaveById: string;
  readonly tripId: string;
  readonly fireAt: Date;
  readonly leaveAt: Date;
  readonly deadline: LeaveByDeadline;
  readonly placeName: string | null;
  readonly tz: string;
  readonly pickup: LeaveByView['pickup'];
  readonly guideNote: string | null;
  readonly snoozeCount: number;
  readonly snoozeAllowed: boolean;
}

export interface HeldAlarm {
  readonly leaveById: string;
  readonly fireAt: Date;
  readonly snoozeAllowed?: boolean;
}

/** Moves smaller than this are the same alarm (clock rounding between the server and the OS). */
const SAME_TIME_MS = 30_000;

export function desiredAlarms(
  views: readonly LeaveByView[],
  now: Date,
  /** Leave-bys whose alarm was snoozed on this phone, with when it rings again. */
  snoozedUntil: ReadonlyMap<string, Date> = new Map(),
): DesiredAlarm[] {
  const out: DesiredAlarm[] = [];
  for (const view of views) {
    if (!view.viewerIn) continue;
    if (view.policy.only_if_not_up && view.viewerUp) continue;
    if (view.leaveAt.getTime() <= now.getTime()) continue;
    const snoozed = snoozedUntil.get(view.id);
    const fireAt = snoozed ?? view.alarmAt;
    if (fireAt.getTime() <= now.getTime()) continue;
    out.push({
      leaveById: view.id,
      tripId: view.tripId,
      fireAt,
      leaveAt: view.leaveAt,
      deadline: view.deadline,
      placeName: view.placeName,
      tz: view.tz,
      pickup: view.pickup,
      guideNote: view.guideNote,
      snoozeCount: view.viewerSnoozes,
      snoozeAllowed: view.viewerSnoozes < view.policy.snooze_limit,
    });
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

export interface AlarmChanges {
  readonly schedule: readonly DesiredAlarm[];
  readonly cancel: readonly string[];
}

export function diffAlarms(
  desired: readonly DesiredAlarm[],
  held: readonly HeldAlarm[],
): AlarmChanges {
  const heldById = new Map(held.map((alarm) => [alarm.leaveById, alarm]));
  const wanted = new Set(desired.map((alarm) => alarm.leaveById));
  const schedule = desired.filter((alarm) => {
    const current = heldById.get(alarm.leaveById);
    if (current === undefined) return true;
    if (Math.abs(current.fireAt.getTime() - alarm.fireAt.getTime()) > SAME_TIME_MS) return true;
    return current.snoozeAllowed !== undefined && current.snoozeAllowed !== alarm.snoozeAllowed;
  });
  const cancel = held.map((alarm) => alarm.leaveById).filter((id) => !wanted.has(id));
  return { schedule, cancel: [...new Set(cancel)] };
}

/** How far ahead the in-app alarm's clock starts watching for a leave-by: a day. */
const WATCH_AHEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Whether any leave-by could ring on the in-app alarm screen today: I'm on it, not up, it has not
 * gone, and its alarm (or its snooze) is due within a day. The alarm's clock runs only then.
 */
export function alarmWatched(
  views: readonly LeaveByView[],
  now: Date,
  snoozedUntil: ReadonlyMap<string, Date> = new Map(),
): boolean {
  return views.some((view) => {
    if (!view.viewerIn || view.viewerUp) return false;
    if (view.leaveAt.getTime() <= now.getTime()) return false;
    const at = snoozedUntil.get(view.id) ?? view.alarmAt;
    return at.getTime() - now.getTime() < WATCH_AHEAD_MS;
  });
}

/** The alarm ringing now (due, not yet past the leave-by), for the in-app alarm screen. */
export function dueAlarm(
  views: readonly LeaveByView[],
  now: Date,
  snoozedUntil: ReadonlyMap<string, Date> = new Map(),
): LeaveByView | null {
  for (const view of views) {
    if (!view.viewerIn || view.viewerUp) continue;
    const at = snoozedUntil.get(view.id) ?? view.alarmAt;
    if (at.getTime() <= now.getTime() && now.getTime() < view.leaveAt.getTime()) return view;
  }
  return null;
}
