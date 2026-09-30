/**
 * The device alarm as the trip day drives it (the shape of the cp-alarm native module's port).
 * The root layout hands the installed module's port to the runtime, `null` in a build without it;
 * features never import native modules themselves.
 */
export type AlarmAuthorization = 'authorized' | 'denied' | 'notDetermined';

export interface AlarmLabels {
  readonly imUp: string;
  readonly slide: string;
  readonly snooze: string;
  readonly snoozeNote: string;
  readonly crewPinged: string;
}

export interface AlarmRequest {
  readonly leaveById: string;
  readonly tripId: string;
  readonly fireAt: string;
  readonly leaveAt: string;
  readonly title: string;
  readonly subtitle: string;
  readonly guideLine: string;
  readonly tintHex: string;
  readonly snoozeAllowed: boolean;
  readonly snoozeMinutes: number;
  readonly snoozeCount: number;
  readonly fullScreen: boolean;
  readonly labels: AlarmLabels;
}

export interface HeldNativeAlarm {
  readonly leaveById: string;
  readonly osAlarmId: string;
  readonly fireAt: string;
  readonly state: 'scheduled' | 'alerting' | 'snoozed';
}

export interface NativeAlarmTap {
  readonly leaveById: string;
  readonly action: 'up' | 'snooze';
  readonly snoozeCount: number;
  readonly at: string;
}

export interface AlarmPort {
  capabilities(): {
    readonly engine: 'alarmkit' | 'exact' | 'inexact';
    readonly fullScreenIntent: boolean;
  };
  authorizationStatus(): AlarmAuthorization;
  requestAuthorization(): Promise<AlarmAuthorization>;
  schedule(request: AlarmRequest): Promise<HeldNativeAlarm>;
  cancel(leaveById: string): Promise<void>;
  list(): Promise<HeldNativeAlarm[]>;
  openExactAlarmSettings(): Promise<boolean>;
  addActionListener(listener: (action: NativeAlarmTap) => void): { remove(): void };
}

let installed: AlarmPort | null = null;

/** Set once by the runtime from the root layout. */
export function setAlarmPort(port: AlarmPort | null): void {
  installed = port;
}

export function alarmPort(): AlarmPort | null {
  return installed;
}
