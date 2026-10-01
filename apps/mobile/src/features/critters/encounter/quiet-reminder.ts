/**
 * "Remind me" on the wandered-off card: a local notification half an hour before the next quiet
 * window, set on this phone (it needs no signal). Asks for notification permission in context;
 * refused, it says so and sets nothing.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the native module loads lazily, so importing this never forces it under Jest. */
import type * as NotificationsModule from 'expo-notifications';

/** How long before the quiet hour the nudge comes. */
export const REMIND_BEFORE_MS = 30 * 60_000;

export async function scheduleQuietReminder(input: {
  readonly at: number;
  readonly title: string;
  readonly body: string;
}): Promise<'set' | 'denied'> {
  const notifications = require('expo-notifications') as typeof NotificationsModule;
  let permission = await notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return 'denied';
  await notifications.scheduleNotificationAsync({
    content: { title: input.title, body: input.body },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Math.max(Date.now() + 60_000, input.at - REMIND_BEFORE_MS)),
    },
  });
  return 'set';
}
