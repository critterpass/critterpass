/**
 * Where a leave-by alarm lives on this phone, best first:
 *
 * - `native`: the cp-alarm module (AlarmKit on iOS 26, an exact or inexact alarm on Android), which
 *   rings through silent mode and Focus;
 * - `notification`: a binary without the module, or the alarm permission refused: a local
 *   time-sensitive notification on the `cp_alarm` channel with I'M UP and SNOOZE actions; or, when
 *   the person switched off "ring through Do Not Disturb" (`user_settings.leave_by_through_dnd`), an
 *   ordinary notification that Focus and Do Not Disturb hold like any other;
 * - `in_app`: notifications refused too: nothing is scheduled with the OS, the app rings its own
 *   alarm screen while it is open, and the server sends the remote copy of the alarm because this
 *   phone never confirms one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- identifiers, channel ids and payload keys. */
import * as Notifications from 'expo-notifications';

import type { AlarmPort } from './alarm-port';
import type { AlarmStatus } from './alarm-store';
import type { DesiredAlarm, HeldAlarm } from './alarm-plan';
import type { AlarmText } from './alarm-copy';

export type AlarmMode = 'native' | 'notification' | 'in_app';

export const LEAVE_BY_CATEGORY = 'cp.leaveby';
/** The same alarm once its one snooze is used: I'M UP only. */
export const LEAVE_BY_CATEGORY_NO_SNOOZE = 'cp.leaveby.final';
export const ALARM_CHANNEL = 'cp_alarm';
const ID_PREFIX = 'leave-by:';

export interface AlarmBackend {
  readonly mode: AlarmMode;
  list(): Promise<HeldAlarm[]>;
  /** Answers the OS alarm id, or null when nothing was scheduled with the OS. */
  schedule(alarm: DesiredAlarm, text: AlarmText, tintHex: string): Promise<string | null>;
  cancel(leaveById: string): Promise<void>;
}

export function nativeBackend(port: AlarmPort, fullScreen: boolean): AlarmBackend {
  return {
    mode: 'native',
    list: async () =>
      (await port.list()).map((alarm) => ({
        leaveById: alarm.leaveById,
        fireAt: new Date(alarm.fireAt),
      })),
    schedule: async (alarm, text, tintHex) => {
      const held = await port.schedule({
        leaveById: alarm.leaveById,
        tripId: alarm.tripId,
        fireAt: alarm.fireAt.toISOString(),
        leaveAt: alarm.leaveAt.toISOString(),
        title: text.title,
        subtitle: text.subtitle,
        guideLine: text.guideLine,
        tintHex,
        snoozeAllowed: alarm.snoozeAllowed,
        snoozeMinutes: 5,
        snoozeCount: alarm.snoozeCount,
        fullScreen,
        labels: text.labels,
      });
      return held.osAlarmId;
    },
    cancel: (leaveById) => port.cancel(leaveById),
  };
}

interface LeaveByNotificationData {
  readonly kind: 'leave_by';
  readonly leave_by_id: string;
  readonly trip_id: string;
  readonly snooze_count: number;
  readonly snooze_allowed: boolean;
}

export function leaveByDataOf(data: unknown): LeaveByNotificationData | null {
  const cp = (data as { cp?: unknown } | null)?.cp;
  if (typeof cp !== 'object' || cp === null) return null;
  const value = cp as Partial<LeaveByNotificationData>;
  if (value.kind !== 'leave_by' || typeof value.leave_by_id !== 'string') return null;
  return {
    kind: 'leave_by',
    leave_by_id: value.leave_by_id,
    trip_id: typeof value.trip_id === 'string' ? value.trip_id : '',
    snooze_count: typeof value.snooze_count === 'number' ? value.snooze_count : 0,
    snooze_allowed: value.snooze_allowed === true,
  };
}

/** The scheduling calls the notification backend needs (expo-notifications on the device). */
export interface LocalNotifications {
  getAllScheduledNotificationsAsync(): Promise<Notifications.NotificationRequest[]>;
  scheduleNotificationAsync(request: Notifications.NotificationRequestInput): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
}

function dateOf(trigger: unknown): Date | null {
  const value = (trigger as { value?: unknown; date?: unknown } | null) ?? null;
  const raw = value?.value ?? value?.date;
  if (typeof raw === 'number' || typeof raw === 'string') return new Date(raw);
  return null;
}

export function notificationBackend(
  notifications: LocalNotifications = Notifications,
  /** Time-sensitive on the alarm channel; false for an ordinary notification. */
  throughDnd = true,
): AlarmBackend {
  return {
    mode: 'notification',
    list: async () => {
      const scheduled = await notifications.getAllScheduledNotificationsAsync();
      const held: HeldAlarm[] = [];
      for (const request of scheduled) {
        const data = leaveByDataOf(request.content.data);
        const fireAt = dateOf(request.trigger);
        if (data === null || fireAt === null) continue;
        held.push({ leaveById: data.leave_by_id, fireAt, snoozeAllowed: data.snooze_allowed });
      }
      return held;
    },
    schedule: async (alarm, text) => {
      const identifier = `${ID_PREFIX}${alarm.leaveById}`;
      await notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
      const data: LeaveByNotificationData = {
        kind: 'leave_by',
        leave_by_id: alarm.leaveById,
        trip_id: alarm.tripId,
        snooze_count: alarm.snoozeCount,
        snooze_allowed: alarm.snoozeAllowed,
      };
      await notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: text.title,
          body: `${text.subtitle}\n${text.guideLine}`,
          categoryIdentifier: alarm.snoozeAllowed ? LEAVE_BY_CATEGORY : LEAVE_BY_CATEGORY_NO_SNOOZE,
          sound: 'default',
          interruptionLevel: throughDnd ? 'timeSensitive' : 'active',
          priority: throughDnd
            ? Notifications.AndroidNotificationPriority.MAX
            : Notifications.AndroidNotificationPriority.HIGH,
          data: { cp: data },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: alarm.fireAt,
          ...(throughDnd ? { channelId: ALARM_CHANNEL } : {}),
        },
      });
      return `local-notification:${identifier}`;
    },
    cancel: (leaveById) =>
      notifications.cancelScheduledNotificationAsync(`${ID_PREFIX}${leaveById}`),
  };
}

/** Nothing with the OS: the app's own alarm screen rings while it is open. */
export function inAppBackend(): AlarmBackend {
  return {
    mode: 'in_app',
    list: () => Promise.resolve([]),
    schedule: () => Promise.resolve(null),
    cancel: () => Promise.resolve(),
  };
}

interface BackendChoice {
  readonly backend: AlarmBackend;
  readonly status: Omit<AlarmStatus, 'next'>;
}

/**
 * How alarms ring on this phone right now: the native alarm when it is allowed and the person lets
 * leave-bys ring through Do Not Disturb, else a notification (time-sensitive, or ordinary with the
 * switch off), else the app's own screen.
 */
export async function chooseBackend(
  port: AlarmPort | null,
  fullScreen: boolean,
  notificationsGranted: () => Promise<{ granted: boolean; canAsk: boolean }>,
  throughDnd = true,
): Promise<BackendChoice> {
  const status = port?.authorizationStatus() ?? null;
  if (port !== null && status === 'authorized' && throughDnd) {
    return {
      backend: nativeBackend(port, fullScreen),
      status: { mode: 'native', engine: port.capabilities().engine, denied: false },
    };
  }
  const notify = await notificationsGranted();
  return {
    backend: notify.granted ? notificationBackend(Notifications, throughDnd) : inAppBackend(),
    status: {
      mode: notify.granted ? 'notification' : 'in_app',
      engine: null,
      denied: status === null ? !notify.granted && !notify.canAsk : status === 'denied',
    },
  };
}
