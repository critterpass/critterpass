import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * How the installed binary rings a leave-by: `alarmkit` (iOS 26 AlarmKit, rings through silent and
 * Focus), `exact` (Android `setAlarmClock`, the user granted `SCHEDULE_EXACT_ALARM`) or `inexact`
 * (Android `setAndAllowWhileIdle` without that grant; it may ring a few minutes late).
 */
export type NativeAlarmEngine = 'alarmkit' | 'exact' | 'inexact';

export type NativeAlarmAuthorization = 'authorized' | 'denied' | 'notDetermined';

export interface NativeAlarmCapabilities {
  readonly engine: NativeAlarmEngine;
  /** Android: `NotificationManager.canUseFullScreenIntent()`; always false on iOS. */
  readonly fullScreenIntent: boolean;
}

/** Copy the native alarm UI shows, already in the reader's language. */
export interface NativeAlarmLabels {
  /** System stop button (iOS) and notification action (Android): "I'm up". */
  readonly imUp: string;
  /** Android full-screen slider: "Slide, I'm up". */
  readonly slide: string;
  /** "Snooze 5 min". */
  readonly snooze: string;
  /** Under the snooze control: "(Tokek will sigh)". */
  readonly snoozeNote: string;
  /** After the one snooze is used: "Crew was pinged". */
  readonly crewPinged: string;
}

export interface NativeAlarmRequest {
  readonly leaveById: string;
  readonly tripId: string;
  /** When it rings, ISO 8601 with offset (leave-by minus the lead). */
  readonly fireAt: string;
  /** The leave-by itself, ISO 8601 with offset (the countdown's end). */
  readonly leaveAt: string;
  /** "Leave by 03:10 · Batur". */
  readonly title: string;
  /** "Pickup at the villa gate · Made is outside". */
  readonly subtitle: string;
  /** The guide's line under the time. */
  readonly guideLine: string;
  /** Guide colour, `#RRGGBB`. */
  readonly tintHex: string;
  /** False once the one snooze is used: the alarm then has no secondary button. */
  readonly snoozeAllowed: boolean;
  readonly snoozeMinutes: number;
  /** Snoozes already used for this leave-by (the next one is sent as `count + 1`). */
  readonly snoozeCount: number;
  /** Android only: the server flag for the full-screen alarm activity is on. */
  readonly fullScreen: boolean;
  readonly labels: NativeAlarmLabels;
}

export interface NativeScheduledAlarm {
  readonly leaveById: string;
  readonly osAlarmId: string;
  readonly fireAt: string;
  readonly state: 'scheduled' | 'alerting' | 'snoozed';
}

/** A tap on the ringing alarm (the native side has already queued the command in the outbox). */
export interface NativeAlarmAction {
  readonly leaveById: string;
  readonly action: 'up' | 'snooze';
  /** Snoozes used after this action. */
  readonly snoozeCount: number;
  readonly at: string;
}

/**
 * The native binding (Swift `CpAlarmModule` / Kotlin `CpAlarmModule`).
 * `requireOptionalNativeModule` answers `null` in a binary built without it (Jest, or a build from
 * before the module existed); the app then rings leave-bys with a local notification instead.
 */
export declare class NativeCpAlarmModule extends NativeModule<{
  onAlarmAction: (action: NativeAlarmAction) => void;
}> {
  capabilities(): NativeAlarmCapabilities;
  authorizationStatus(): NativeAlarmAuthorization;
  requestAuthorization(): Promise<NativeAlarmAuthorization>;
  /** Replaces any alarm already set for `leaveById`. */
  schedule(request: NativeAlarmRequest): Promise<NativeScheduledAlarm>;
  cancel(leaveById: string): Promise<void>;
  list(): Promise<NativeScheduledAlarm[]>;
  /** Android: the system page that grants exact alarms; false where there is none. */
  openExactAlarmSettings(): Promise<boolean>;
}

export const nativeCpAlarmModule = requireOptionalNativeModule<NativeCpAlarmModule>('CpAlarm');
