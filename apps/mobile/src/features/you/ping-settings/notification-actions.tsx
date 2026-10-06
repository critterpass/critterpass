/**
 * The notification buttons no single feature owns, mounted once inside the signed-in session: the
 * categories are registered with titles from the reader's catalogs (again when the language
 * changes), and a background button (reply, mark read, later, add all, react, the payment buttons)
 * becomes its command through the command client, so it queues offline like the same button in the
 * app. A reply that woke the app is picked up from the last response once the session is up.
 */
import type { NotificationActionSpec, NotificationCategory } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { registerNotificationCategories } from '@/data/push/categories';
import { actionReplyOf, createActionReplyHandler } from '@/data/push/notification-actions';
import { openPushTap } from '@/data/push/use-push-notifications';

const OPEN = msg({ id: 'you.pings.action.open', message: 'Open' });

/** Button titles by `<category>:<action>`; a vote's buttons are renamed to its options when shown. */
export const ACTION_TITLES: Readonly<Record<string, MessageDescriptor>> = {
  'cp.vote:VOTE_1': msg({ id: 'you.pings.action.vote1', message: 'Option 1' }),
  'cp.vote:VOTE_2': msg({ id: 'you.pings.action.vote2', message: 'Option 2' }),
  'cp.vote:VOTE_3': msg({ id: 'you.pings.action.vote3', message: 'Option 3' }),
  'cp.vote:OPEN': OPEN,
  'cp.rsvp:IN': msg({ id: 'you.pings.action.rsvpIn', message: "I'm in" }),
  'cp.rsvp:MAYBE': msg({ id: 'you.pings.action.rsvpMaybe', message: 'Maybe' }),
  'cp.rsvp:OPEN': OPEN,
  'cp.generic:OPEN': OPEN,
  'cp.chat:REPLY': msg({ id: 'you.pings.action.reply', message: 'Reply' }),
  'cp.chat:READ': msg({ id: 'you.pings.action.markRead', message: 'Mark read' }),
  'cp.invite:JOIN': msg({ id: 'you.pings.action.join', message: 'Join' }),
  'cp.invite:LATER': msg({ id: 'you.pings.action.later', message: 'Later' }),
  'cp.import:ADD_ALL': msg({ id: 'you.pings.action.addAll', message: 'Add all' }),
  'cp.memory:REACT': msg({ id: 'you.pings.action.react', message: 'Love it' }),
};

const QUEUED = msg({
  id: 'you.pings.action.queued',
  message: 'Your answer from a notification',
});

export function NotificationActions() {
  const { t, i18n } = useLingui();
  const { commands } = useLocalFirst();

  useEffect(() => {
    const title = (category: NotificationCategory, action: NotificationActionSpec) => {
      const known = ACTION_TITLES[`${category}:${action.id}`];
      return known === undefined ? action.title : t(known);
    };
    void registerNotificationCategories(title);
  }, [t, i18n.locale]);

  useEffect(() => {
    const handler = createActionReplyHandler({
      send: (command) =>
        commands.send(
          defineClientCommand<Readonly<Record<string, unknown>>>({
            name: command.name,
            offline: command.offline,
            summarize: () => QUEUED,
          }),
          command.payload,
        ),
      open: openPushTap,
    });
    const onResponse = (response: Notifications.NotificationResponse | null) => {
      if (response === null) return;
      const reply = actionReplyOf(response);
      if (reply === null) return;
      void handler
        .handle(reply)
        .then(() => Notifications.clearLastNotificationResponseAsync().catch(() => undefined));
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
    Notifications.getLastNotificationResponseAsync().then(onResponse, () => undefined);
    return () => subscription.remove();
  }, [commands]);

  return null;
}
