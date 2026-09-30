/**
 * The leave-by alarm on the device: AlarmKit on iOS 26, an exact alarm (and, behind a server flag,
 * a full-screen alarm activity) on Android. Every call is safe in a binary built without the
 * module: `isAlarmModuleInstalled()` is then false and the app rings leave-bys another way.
 */
import type { EventSubscription } from 'expo';

import {
  nativeCpAlarmModule,
  type NativeAlarmAction,
  type NativeAlarmAuthorization,
  type NativeAlarmCapabilities,
  type NativeAlarmLabels,
  type NativeAlarmRequest,
  type NativeScheduledAlarm,
} from './src/CpAlarmModule';

export type {
  NativeAlarmAction as AlarmAction,
  NativeAlarmAuthorization as AlarmAuthorization,
  NativeAlarmCapabilities as AlarmCapabilities,
  NativeAlarmLabels as AlarmLabels,
  NativeAlarmRequest as AlarmRequest,
  NativeScheduledAlarm as ScheduledAlarm,
};

/** The device alarm port the app's alarm sync drives; `null` without the native module. */
export interface AlarmPort {
  capabilities(): NativeAlarmCapabilities;
  authorizationStatus(): NativeAlarmAuthorization;
  requestAuthorization(): Promise<NativeAlarmAuthorization>;
  schedule(request: NativeAlarmRequest): Promise<NativeScheduledAlarm>;
  cancel(leaveById: string): Promise<void>;
  list(): Promise<NativeScheduledAlarm[]>;
  openExactAlarmSettings(): Promise<boolean>;
  addActionListener(listener: (action: NativeAlarmAction) => void): EventSubscription;
}

export function isAlarmModuleInstalled(): boolean {
  return nativeCpAlarmModule !== null;
}

let port: AlarmPort | null = null;

/** The one port over the installed module (the same object every call), or `null` without it. */
export function getAlarmPort(): AlarmPort | null {
  const native = nativeCpAlarmModule;
  if (native === null) return null;
  port ??= {
    capabilities: () => native.capabilities(),
    authorizationStatus: () => native.authorizationStatus(),
    requestAuthorization: () => native.requestAuthorization(),
    schedule: (request) => native.schedule(request),
    cancel: (leaveById) => native.cancel(leaveById),
    list: () => native.list(),
    openExactAlarmSettings: () => native.openExactAlarmSettings(),
    addActionListener: (listener) => native.addListener('onAlarmAction', listener),
  };
  return port;
}
