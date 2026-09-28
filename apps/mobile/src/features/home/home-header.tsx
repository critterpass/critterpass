/**
 * Home's header (3b-2, 3b-6): "HEY {NAME} ›" to the profile, the crew switcher ▾ (the crews sheet),
 * the crew pill (member faces, chat, unread from the chat) and the bell with the needs-you count.
 * The bell rings once, with a light haptic, whenever the count goes up.
 */
import { resolveMemberStyle } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { HomeHeader } from '@/ui/shell/HomeHeader';

import { useChatUnread } from './data/session-rows';
import type { HomeCrew } from './data/use-home-state';
import { crewChatRoute, HOME_ROUTES, homeRoutes } from './routes';

export interface HomeHeaderBarProps {
  readonly name: string;
  readonly crew: HomeCrew;
  readonly needsYou: number;
  readonly uid: string;
}

/** A light haptic when the needs-you count goes up (the bell's ring is drawn by the header). */
export function useRingHaptic(count: number): void {
  const last = useRef(count);
  useEffect(() => {
    if (count > last.current) impact('bell');
    last.current = count;
  }, [count]);
}

export function HomeHeaderBar({ name, crew, needsYou, uid }: HomeHeaderBarProps) {
  const locale = useLocale();
  const unreadChat = useChatUnread(crew.id, uid);
  useRingHaptic(needsYou);
  return (
    <HomeHeader
      name={name}
      crewName={crew.name}
      members={crew.members.map((member) => ({
        initial: upper(member.name.slice(0, 1), locale),
        color: resolveMemberStyle(member.joinIndex).color,
      }))}
      unreadChat={unreadChat}
      unreadInbox={needsYou}
      onOpenProfile={() => {
        const href = homeRoutes.profile();
        if (href !== undefined) router.push(href);
      }}
      onSwitchCrew={() => router.push(HOME_ROUTES.crewSheet)}
      onOpenChat={() => router.push(crewChatRoute(crew.id))}
      onOpenInbox={() => router.push(HOME_ROUTES.inbox)}
    />
  );
}
