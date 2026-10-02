/**
 * How a leave-by alarm rings, from the person's "ring through Do Not Disturb" switch: on, the
 * native alarm (or a time-sensitive notification without it); off, a normal notification even
 * where the native alarm is allowed, so Focus and Do Not Disturb hold it like any other.
 */
import { describe, expect, it } from '@jest/globals';
import type * as Notifications from 'expo-notifications';

import { tokens } from '@cp/design-tokens';

import { chooseBackend, notificationBackend, type LocalNotifications } from '../alarm-backends';
import type { DesiredAlarm } from '../alarm-plan';
import type { AlarmPort } from '../alarm-port';

const authorizedPort = {
  authorizationStatus: () => 'authorized',
  capabilities: () => ({ engine: 'alarmkit', fullScreenIntent: false }),
} as unknown as AlarmPort;

const granted = () => Promise.resolve({ granted: true, canAsk: true });
const refused = () => Promise.resolve({ granted: false, canAsk: false });

describe('chooseBackend', () => {
  it('rings the native alarm while the switch is on', async () => {
    const choice = await chooseBackend(authorizedPort, false, granted, true);
    expect(choice.status.mode).toBe('native');
  });

  it('sends a normal notification instead of the alarm while the switch is off', async () => {
    const choice = await chooseBackend(authorizedPort, false, granted, false);
    expect(choice.status).toMatchObject({ mode: 'notification', engine: null, denied: false });
    expect((await chooseBackend(null, false, granted, false)).status.mode).toBe('notification');
  });

  it('falls back to the app screen when notifications are refused, either way', async () => {
    expect((await chooseBackend(authorizedPort, false, refused, false)).status.mode).toBe('in_app');
    expect((await chooseBackend(null, false, refused, true)).status.mode).toBe('in_app');
  });
});

describe('notificationBackend', () => {
  const alarm = {
    leaveById: 'lb-1',
    tripId: 'trip-1',
    fireAt: new Date('2026-10-15T19:00:00Z'),
    snoozeAllowed: true,
    snoozeCount: 0,
  } as DesiredAlarm;
  const text = {
    eyebrow: '',
    time: '03:10',
    title: 'Leave by 03:10',
    subtitle: 'Pickup at the villa gate',
    guideLine: 'Up!',
    labels: { imUp: '', slide: '', snooze: '', snoozeNote: '', crewPinged: '' },
  };

  async function scheduled(throughDnd: boolean) {
    const requests: Notifications.NotificationRequestInput[] = [];
    const notifications: LocalNotifications = {
      getAllScheduledNotificationsAsync: () => Promise.resolve([]),
      scheduleNotificationAsync: (request) => {
        requests.push(request);
        return Promise.resolve(request.identifier ?? '');
      },
      cancelScheduledNotificationAsync: () => Promise.resolve(),
    };
    await notificationBackend(notifications, throughDnd).schedule(alarm, text, tokens.guide.tokek);
    return requests[0];
  }

  it('is time-sensitive on the alarm channel while it may ring through Do Not Disturb', async () => {
    const request = await scheduled(true);
    expect(request?.content.interruptionLevel).toBe('timeSensitive');
    expect(request?.trigger).toMatchObject({ channelId: 'cp_alarm' });
  });

  it('is an ordinary notification once the switch is off', async () => {
    const request = await scheduled(false);
    expect(request?.content.interruptionLevel).toBe('active');
    expect(request?.trigger).not.toHaveProperty('channelId');
  });
});
