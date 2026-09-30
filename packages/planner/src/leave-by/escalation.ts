/**
 * The leave-by's escalation: scheduled → window (30 minutes out) → alerting (the alarm rang) →
 * departed, or cancelled at any point before departure. A member who snoozes past the limit, or is
 * still asleep at `leave_at`, earns one crew knock: the members already up are asked to wake them.
 */
import type { LeaveByState, ReadinessState } from '@cp/domain';

import { alarmAt, windowOf } from './window';

export type LeaveByTransition =
  'window_opened' | 'alarm_fired' | 'departed' | 'cancelled' | 'rescheduled';

const TERMINAL: ReadonlySet<LeaveByState> = new Set(['departed', 'cancelled']);

export function nextLeaveByState(state: LeaveByState, event: LeaveByTransition): LeaveByState {
  if (TERMINAL.has(state)) return state;
  switch (event) {
    case 'cancelled':
    case 'departed':
      return event;
    case 'rescheduled':
      return 'scheduled';
    case 'window_opened':
      return state === 'scheduled' ? 'window' : state;
    case 'alarm_fired':
      return 'alerting';
  }
}

/** The state the clock alone implies (a recompute that moved `leave_at` re-derives it). */
export function stateByClock(now: Date, leaveAt: Date, leadMin: number): LeaveByState {
  if (now.getTime() >= alarmAt(leaveAt, leadMin).getTime()) return 'alerting';
  if (now.getTime() >= windowOf(leaveAt).opensAt.getTime()) return 'window';
  return 'scheduled';
}

export interface KnockInput {
  readonly state: ReadinessState;
  readonly snoozeCount: number;
  readonly snoozeLimit: number;
  readonly knockSentAt: Date | null;
  readonly now: Date;
  readonly leaveAt: Date;
}

/** Why the crew should knock for this member now, or `null`. Never twice, never for someone up. */
export function knockReason(input: KnockInput): 'snooze' | 'late' | null {
  if (input.knockSentAt !== null || input.state !== 'not_up') return null;
  if (input.snoozeCount > input.snoozeLimit) return 'snooze';
  if (input.now.getTime() >= input.leaveAt.getTime()) return 'late';
  return null;
}
