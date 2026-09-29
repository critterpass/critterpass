/**
 * The Android messaging service's JS bridge (Kotlin `CpNotificationsModule`): taps on the
 * notifications it rendered and the conversation on screen for foreground suppression. `null` on
 * iOS (taps arrive through expo-notifications there), in Jest and in a binary built before the
 * module existed.
 */
import { NativeModule, requireOptionalNativeModule, type EventSubscription } from 'expo';

/** A tap on a notification or on a conversation shortcut; the shortcut has no `nid`. */
export interface NativeNotificationTap {
  readonly nid: string | null;
  readonly deeplink: string | null;
  readonly type: string | null;
  readonly crewId: string | null;
}

type CpNotificationsEvents = {
  onTap: (tap: NativeNotificationTap) => void;
};

declare class NativeCpNotificationsModule extends NativeModule<CpNotificationsEvents> {
  /** The tap that opened the app (or one no listener has seen yet), handed out once. */
  takeInitialTap(): NativeNotificationTap | null;
  /** The crew id whose chat is on screen, or null; the service skips that thread's pushes. */
  setActiveConversation(conversationId: string | null): void;
}

const native = requireOptionalNativeModule<NativeCpNotificationsModule>('CpNotifications');

export interface CpNotificationsBridge {
  takeInitialTap(): NativeNotificationTap | null;
  addTapListener(listener: (tap: NativeNotificationTap) => void): EventSubscription;
  setActiveConversation(conversationId: string | null): void;
}

export const cpNotifications: CpNotificationsBridge | null =
  native === null
    ? null
    : {
        takeInitialTap: () => native.takeInitialTap(),
        addTapListener: (listener) => native.addListener('onTap', listener),
        setActiveConversation: (conversationId) => native.setActiveConversation(conversationId),
      };
