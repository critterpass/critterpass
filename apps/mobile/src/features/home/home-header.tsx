/**
 * Home's header (3b-2, 3b-6): "HEY {NAME} ›" to the profile, the crew switcher ▾ (the crews sheet),
 * the crew pill (member faces, chat, unread from the chat) and the bell with the needs-you count.
 * The bell rings once, with a light haptic, whenever the count goes up, and an arrival that needs
 * the user (placed ideas, a plan to answer, a crewmate's answer) is said once as a toast.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { impact } from '@/motion/feedback';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { HomeHeader, HomeHeaderBell } from '@/ui/shell/HomeHeader';
import { Row } from '@/ui/layout/Row';
import { makeStyles } from '@/ui/theme';

import { useChatUnread, useOtherCrewsUnread } from './data/session-rows';
import type { HomeCrew } from './data/use-home-state';
import { useInboxToast } from './inbox/use-inbox-toast';
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
  const { t } = useLingui();
  const unreadChat = useChatUnread(crew.id, uid);
  const otherUnread = useOtherCrewsUnread(crew.id, uid);
  const me = crew.members.find((member) => member.userId === uid);
  useRingHaptic(needsYou);
  // Home stays mounted under the screens pushed over it, so an arrival is said wherever she is.
  useInboxToast(uid);
  return (
    <HomeHeader
      name={name}
      crewName={crew.name}
      {...(name === '' ? { greeting: t({ id: 'home.header.greetingAnon', message: 'Hey' }) } : {})}
      {...(me === undefined ? {} : { me: { uid, joinIndex: me.joinIndex } })}
      members={crew.members.map((member) => ({
        name: member.name,
        uid: member.userId,
        joinIndex: member.joinIndex,
      }))}
      otherCrewsUnread={otherUnread}
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

const useStyles = makeStyles((th) => ({
  slim: { paddingHorizontal: th.size.gutter, paddingVertical: th.space['8'] },
}));

/**
 * Home before the first crew: no greeting or crew pill yet, only the two ways to what may already
 * be waiting: "Your crews" (an invite from a friend is answered there) and the inbox bell.
 */
export function FirstRunHeaderBar({
  needsYou,
  uid,
}: {
  readonly needsYou: number;
  readonly uid: string;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  useRingHaptic(needsYou);
  useInboxToast(uid);
  return (
    <Row justify="space-between" align="center" style={styles.slim} testID="home-first-run-header">
      <HeaderPill
        label={t({ id: 'home.header.yourCrews', message: 'Your crews' })}
        onPress={() => router.push(HOME_ROUTES.crewSheet)}
        testID="home-your-crews"
      />
      <HomeHeaderBell count={needsYou} onPress={() => router.push(HOME_ROUTES.inbox)} />
    </Row>
  );
}
