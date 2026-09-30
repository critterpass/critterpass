/**
 * The phone's leave-by alarm state, shared between the alarm sync (which writes it) and the
 * screens (which read it): how alarms ring here, which alarms are snoozed until when, and which
 * one the in-app alarm screen is showing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- mode values, never copy. */
import { useSyncExternalStore } from 'react';

import type { AlarmMode } from './alarm-backends';

export interface AlarmStatus {
  readonly mode: AlarmMode;
  /** How the native module rings (`inexact` on Android without the exact-alarm grant). */
  readonly engine: 'alarmkit' | 'exact' | 'inexact' | null;
  /** The alarm permission was refused (AlarmKit authorization, or notifications for the fallback). */
  readonly denied: boolean;
  /** Next alarm this phone holds, for "Your alarm is set for 03:00". */
  readonly next: { readonly leaveById: string; readonly fireAt: Date } | null;
}

export interface AlarmState {
  readonly status: AlarmStatus;
  readonly snoozedUntil: ReadonlyMap<string, Date>;
  /** Alarms I stopped or dismissed on this phone (the in-app screen stays closed for them). */
  readonly silenced: ReadonlySet<string>;
  /** Bumped when permissions may have changed, so the sync looks again. */
  readonly generation: number;
}

const INITIAL: AlarmState = {
  status: { mode: 'in_app', engine: null, denied: false, next: null },
  snoozedUntil: new Map(),
  silenced: new Set(),
  generation: 0,
};

let state: AlarmState = INITIAL;
const listeners = new Set<() => void>();

function emit(next: AlarmState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export const alarmStore = {
  get: (): AlarmState => state,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setStatus(status: AlarmStatus): void {
    const current = state.status;
    if (
      current.mode === status.mode &&
      current.engine === status.engine &&
      current.denied === status.denied &&
      current.next?.leaveById === status.next?.leaveById &&
      current.next?.fireAt.getTime() === status.next?.fireAt.getTime()
    ) {
      return;
    }
    emit({ ...state, status });
  },
  snooze(leaveById: string, until: Date): void {
    const snoozedUntil = new Map(state.snoozedUntil);
    snoozedUntil.set(leaveById, until);
    emit({ ...state, snoozedUntil });
  },
  silence(leaveById: string): void {
    const silenced = new Set(state.silenced);
    silenced.add(leaveById);
    emit({ ...state, silenced });
  },
  /** Asks the sync for another pass (a permission was just granted or refused). */
  resync(): void {
    emit({ ...state, generation: state.generation + 1 });
  },
  /** Test and sign-out reset. */
  reset(): void {
    emit(INITIAL);
  },
};

export function useAlarmState(): AlarmState {
  return useSyncExternalStore(alarmStore.subscribe, alarmStore.get);
}
