/**
 * Foreground presentation: a push arriving while the app is open shows as a banner, except a chat
 * push for the conversation already on screen, which the chat itself is showing. iOS asks
 * expo-notifications' handler per notification; Android's messaging service renders natively, so
 * it is told which conversation is on screen instead (the same crew id).
 */
import type { PushTap } from './routing';

const CREW_CHAT_ROUTE = /^\/crew\/([^/?#]+)\/chat(?:[/?#]|$)/;

/** The crew id whose chat `pathname` shows, or null. */
export function activeConversationOf(pathname: string): string | null {
  const match = CREW_CHAT_ROUTE.exec(pathname);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : null;
}

/** The crew conversation a chat push belongs to, read from its crew or its chat link. */
export function conversationOfTap(tap: PushTap): string | null {
  if (tap.type !== 'crew_chat') return null;
  if (tap.crewId !== null) return tap.crewId;
  return tap.deeplink === null ? null : activeConversationOf(pathOf(tap.deeplink));
}

/** The route part of a link: after the host for web links, after `://` for the app's scheme. */
function pathOf(link: string): string {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(link.trim());
  if (match === null) return link.trim();
  const [, scheme = '', rest = ''] = match;
  if (/^https?$/i.test(scheme)) {
    const slash = rest.indexOf('/');
    return slash < 0 ? '/' : rest.slice(slash);
  }
  return `/${rest.replace(/^\/+/, '')}`;
}

export function shouldPresentInForeground(tap: PushTap | null, pathname: string): boolean {
  if (tap === null) return true;
  const conversation = conversationOfTap(tap);
  return conversation === null || conversation !== activeConversationOf(pathname);
}

/** expo-notifications' `NotificationBehavior` for a foreground push. */
export interface ForegroundBehavior {
  readonly shouldShowBanner: boolean;
  readonly shouldShowList: boolean;
  readonly shouldPlaySound: boolean;
  readonly shouldSetBadge: boolean;
}

export function foregroundBehavior(present: boolean): ForegroundBehavior {
  return {
    shouldShowBanner: present,
    shouldShowList: present,
    shouldPlaySound: present,
    // The badge mirrors the inbox's needs-you count (features/home/inbox/use-app-badge.ts).
    shouldSetBadge: false,
  };
}
