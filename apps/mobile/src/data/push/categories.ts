/**
 * Registers the notification categories whose actions the app itself does not run: the vote and
 * RSVP posters (their buttons are answered inside the Notification Content extension, signed with
 * the device action key, without unlocking or opening the app) and the generic OPEN. Categories
 * whose actions a feature answers in the app register themselves with that feature's handler
 * (`cp.changeset`, `cp.leaveby`, `cp.sos`, `cp.help`, `cp.setup_ask`). The ids and actions come
 * from packages/domain `NOTIFICATION_CATEGORY_SPECS` (docs/api-contracts-async.md §3.4).
 */
/* eslint-disable lingui/no-unlocalized-strings -- category ids, never copy. */
import * as Notifications from 'expo-notifications';

import {
  notificationCategorySpec,
  type NotificationActionSpec,
  type NotificationCategory,
} from '@cp/domain';

/** The categories this module registers; the rest belong to the feature that answers them. */
export const APP_REGISTERED_CATEGORIES: readonly NotificationCategory[] = [
  'cp.vote',
  'cp.rsvp',
  'cp.generic',
];

export type CategoryWriter = (
  id: string,
  actions: Notifications.NotificationAction[],
) => Promise<unknown>;

/** The button label in the reader's language; the domain's English title is the fallback. */
export type ActionTitle = (
  category: NotificationCategory,
  action: NotificationActionSpec,
) => string;

export function categoryActions(
  category: NotificationCategory,
  title: ActionTitle,
): Notifications.NotificationAction[] {
  return notificationCategorySpec(category).actions.map((action) => ({
    identifier: action.id,
    buttonTitle: title(category, action),
    options: {
      opensAppToForeground: action.foreground,
      isAuthenticationRequired: action.authenticationRequired,
      isDestructive: action.destructive,
    },
  }));
}

/** Registers (or re-titles, after a language change) every category this module owns. */
export async function registerNotificationCategories(
  title: ActionTitle,
  write: CategoryWriter = Notifications.setNotificationCategoryAsync,
): Promise<void> {
  await Promise.all(
    APP_REGISTERED_CATEGORIES.map((category) =>
      write(category, categoryActions(category, title)).catch(() => undefined),
    ),
  );
}
