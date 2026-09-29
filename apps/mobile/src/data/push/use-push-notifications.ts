/**
 * Mounts notification taps and foreground presentation for the root navigator: taps (the one that
 * opened the app, then every later one) route through ./routing.ts; foreground pushes follow
 * ./foreground.ts. Not unit-tested: it only connects expo-notifications, the Android bridge and
 * expo-router to the tested decisions. The app root passes the bridge (modules/cp-notifications),
 * null where the platform has none.
 */
import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { activeConversationOf, foregroundBehavior, shouldPresentInForeground } from './foreground';
import { createTapRouter, tapFromNotification, type PushTap } from './routing';

const tapRouter = createTapRouter({ navigate: (href) => router.push(href) });

/** The Android messaging service's bridge, as modules/cp-notifications exports it. */
export interface NotificationTapBridge {
  takeInitialTap(): PushTap | null;
  addTapListener(listener: (tap: PushTap) => void): { remove(): void };
  setActiveConversation(conversationId: string | null): void;
}

let initialTapTaken = false;

function takeInitialTaps(cpNotifications: NotificationTapBridge | null): PushTap[] {
  if (initialTapTaken) return [];
  initialTapTaken = true;
  const taps: PushTap[] = [];
  const android = cpNotifications?.takeInitialTap() ?? null;
  if (android !== null) taps.push(android);
  const response = Notifications.getLastNotificationResponse();
  if (response !== null) {
    Notifications.clearLastNotificationResponse();
    const tap = tapFromNotification(response.notification);
    if (tap !== null) taps.push(tap);
  }
  return taps;
}

export function usePushNotifications(cpNotifications: NotificationTapBridge | null): void {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    cpNotifications?.setActiveConversation(activeConversationOf(pathname));
  }, [cpNotifications, pathname]);

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: (notification) =>
        Promise.resolve(
          foregroundBehavior(
            shouldPresentInForeground(tapFromNotification(notification), pathnameRef.current),
          ),
        ),
    });
    for (const tap of takeInitialTaps(cpNotifications)) void tapRouter.handle(tap);
    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      void tapRouter.handle(tapFromNotification(response.notification));
    });
    const androidTaps = cpNotifications?.addTapListener((tap) => void tapRouter.handle(tap));
    return () => {
      responses.remove();
      androidTaps?.remove();
      Notifications.setNotificationHandler(null);
    };
  }, [cpNotifications]);
}
