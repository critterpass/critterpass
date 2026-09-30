/**
 * The leave-by's clock: the 30-minute window the day-of ring drains over, when the alarm rings,
 * and the timers the worker arms (traffic re-checks three hours and 45 minutes out, the window
 * opening, the alarm check and T0).
 */
import { DEFAULT_ALARM_LEAD_MIN, type LeaveBySlot } from '@cp/domain';

const MINUTE = 60_000;

export const WINDOW_MIN = 30;

export interface LeaveByWindow {
  readonly opensAt: Date;
  readonly closesAt: Date;
}

export function windowOf(leaveAt: Date): LeaveByWindow {
  return { opensAt: new Date(leaveAt.getTime() - WINDOW_MIN * MINUTE), closesAt: leaveAt };
}

/** The share of the window still left: 1 before it opens, draining to 0 at `leave_at`. */
export function ringRemaining(now: Date, leaveAt: Date): number {
  const left = leaveAt.getTime() - now.getTime();
  if (left <= 0) return 0;
  return Math.min(1, left / (WINDOW_MIN * MINUTE));
}

export function alarmAt(leaveAt: Date, leadMin: number = DEFAULT_ALARM_LEAD_MIN): Date {
  return new Date(leaveAt.getTime() - leadMin * MINUTE);
}

export interface LeaveByTimer {
  readonly slot: LeaveBySlot;
  readonly at: Date;
}

const OFFSETS_MIN: readonly (readonly [LeaveBySlot, number | 'lead'])[] = [
  ['traffic_3h', 180],
  ['traffic_45m', 45],
  ['window', WINDOW_MIN],
  ['alarm', 'lead'],
  ['t0', 0],
];

/** The timers still ahead of `now`, earliest first. */
export function leaveByTimers(
  leaveAt: Date,
  now: Date,
  leadMin: number = DEFAULT_ALARM_LEAD_MIN,
): LeaveByTimer[] {
  return OFFSETS_MIN.map(([slot, offset]) => ({
    slot,
    at: new Date(leaveAt.getTime() - (offset === 'lead' ? leadMin : offset) * MINUTE),
  }))
    .filter((timer) => timer.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}
