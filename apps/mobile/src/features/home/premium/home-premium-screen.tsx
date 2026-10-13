/**
 * The premium Home (3.01–3.04): a root screen titled with the crew under a "Hey <name>" greeting;
 * the title and its caret open the crew switcher (3.07). With a crew the header carries the crew
 * chat (with its unread count) and the bell (with the inbox count); before any crew, the bell and
 * the ink `+` that starts one. The body follows the mode machine (./home-sections). A first sync
 * shows the real layout as shimmer with Pon bringing the trip over (3.03).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and SF Symbol names, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { createElement, useContext, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import {
  Avatar,
  CrewStack,
  Text,
  makePremiumStyles,
  usePremiumTheme,
  PressableScale,
} from '@/ui/premium';
import { RootScreen, type ShellAction } from '@/ui/premium/shell';

import { useChatUnread } from '../data/session-rows';
import {
  FIRST_SYNC_PATIENCE_MS,
  useElapsed,
  useHomeState,
  type HomeView,
} from '../data/use-home-state';
import { useRingHaptic } from '../ring-haptic';
import { useAppBadge } from '../inbox/use-app-badge';
import { useInboxToast } from '../inbox/use-inbox-toast';
import { useOpenTrip } from '../join-trip';
import { useRecordAppOpen } from '../nudge/use-record-app-open';
import { crewChatRoute, HOME_ROUTES } from '../routes';
import { homeNotice } from '../slots';
import { CrewSwitcherMenu } from './crew-switcher/crew-switcher-menu';
import { useCrewSwitcherRequest } from './crew-switcher/open-request';
import { GlassGlyphButton } from './components/glass-glyph-button';
import { HomeGlyph } from './components/home-glyph';
import { HomeSyncing } from './components/home-syncing';
import { PremiumDevTools } from './components/premium-dev-tools';
import { CrewSection, FirstRunSection } from './home-sections';
import { crewAvatars } from './use-premium-home';

const useStyles = makePremiumStyles((t) => ({
  content: {
    paddingHorizontal: t.space.gutter,
    paddingBottom: t.space.tabBarClearance,
    gap: t.space.gap16,
  },
  crewLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap8,
    paddingStart: t.space.titleGutter - t.space.gutter,
    minHeight: t.size.hit,
  },
  head: {
    paddingTop: t.space.gap6,
    paddingStart: t.space.titleGutter - t.space.gutter,
    paddingEnd: (t.size.glassNav + t.space.gap8) * 2,
  },
  greeting: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap6 },
  title: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap4, alignSelf: 'flex-start' },
  titleText: { flexShrink: 1 },
  buttons: {
    position: 'absolute',
    flexDirection: 'row',
    gap: t.space.gap8,
  },
}));

export interface HomePremiumScreenProps {
  readonly crewId?: string | null;
}

/** Home waits for the session's database; with none after a short wait it is the first run. */
export function HomePremiumScreen(props: HomePremiumScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  const patienceOver = useElapsed(FIRST_SYNC_PATIENCE_MS);
  if (localFirst !== null) return <HomeContent {...props} />;
  return <HomeFrame view={null}>{patienceOver ? <FirstRunSection /> : <HomeSyncing />}</HomeFrame>;
}

function HomeContent({ crewId = null }: HomePremiumScreenProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const view = useHomeState(picked ?? crewId);
  const openTrip = useOpenTrip(view.uid, view.crew?.id ?? null);
  useAppBadge(view.needsYou, view.status === 'ready');
  useRecordAppOpen();
  useRingHaptic(view.needsYou);
  useInboxToast(view.uid);
  const now = new Date();
  return (
    <HomeFrame view={view} onPick={setPicked}>
      {view.status === 'loading' ? (
        <HomeSyncing />
      ) : view.home.mode === 'first_run' || view.crew === null ? (
        <FirstRunSection />
      ) : (
        <>
          <HomeNotice />
          <CrewSection view={view} openTrip={openTrip} now={now} />
        </>
      )}
    </HomeFrame>
  );
}

/** The notice another area puts above the crew's cards (a failed Pass+ renewal), when there is one. */
function HomeNotice() {
  const th = usePremiumTheme();
  const Notice = homeNotice();
  if (Notice === null) return null;
  return (
    <View style={{ paddingHorizontal: th.space.gutter, paddingBottom: th.space.gap12 }}>
      {createElement(Notice)}
    </View>
  );
}

/** The one method the switcher's anchor is measured with. */
interface Measurable {
  measureInWindow(callback: (x: number, y: number, width: number, height: number) => void): void;
}

interface HomeFrameProps {
  readonly view: HomeView | null;
  readonly onPick?: (crewId: string) => void;
  readonly children: React.ReactNode;
}

function HomeFrame({ view, onPick, children }: HomeFrameProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  const [switcherTop, setSwitcherTop] = useState<number | null>(null);
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const crew = view?.crew ?? null;
  const needsYou = view?.needsYou ?? 0;
  const title = crew?.name ?? t({ id: 'home.premium.title', message: 'Home' });
  const count = crew?.members.length ?? 0;

  const plus: ShellAction = {
    key: 'plus',
    label: t({ id: 'home.firstRun.startCrew', message: 'Start a crew' }),
    sfSymbol: 'plus',
    glyph: 'plus',
    primary: true,
    testID: 'home-plus',
    onPress: () => router.push('/crew/new'),
  };
  const openSwitcher = () => {
    const node = anchor.current as Measurable | null;
    node?.measureInWindow((_x, y, _w, h) => setSwitcherTop(y + h));
  };
  // The crews link (`/crew`) lands here with the switcher open.
  useCrewSwitcherRequest(view !== null && view.status !== 'loading', openSwitcher);
  const switcherLabel = t({ id: 'home.premium.switcher.open', message: 'Switch crew' });
  const caret = (
    <HomeGlyph
      name={switcherTop === null ? 'chevronDown' : 'chevronUp'}
      size={crew === null ? 16 : 22}
      color={crew === null ? theme.color.muted : theme.color.ink}
    />
  );
  const me = crew === null ? undefined : crewAvatars(theme, crew).find((m) => m.id === view?.uid);
  const firstName = view?.firstName ?? '';
  const noTrip = view?.home.mode === 'no_trip';

  return (
    <View style={{ flex: 1 }} testID="home-screen">
      <RootScreen title={title} actions={crew === null ? [plus] : []} header="drawn">
        {({ scrollProps, largeTitle }) => (
          <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
            {crew === null ? (
              largeTitle
            ) : (
              <View style={[styles.head, { marginTop: insets.top }]}>
                {firstName === '' ? null : (
                  <View style={styles.greeting} testID="home-greeting">
                    {me === undefined ? null : (
                      <Avatar name={me.name} color={me.color} uid={me.id} size={20} />
                    )}
                    <Text variant="rowText" tone="muted" numberOfLines={1}>
                      {t({ id: 'home.premium.greeting', message: `Hey ${firstName}` })}
                    </Text>
                  </View>
                )}
                <PressableScale
                  onPress={openSwitcher}
                  accessibilityRole="button"
                  accessibilityLabel={`${crew.name}, ${switcherLabel}`}
                  testID="home-crew-switcher"
                >
                  <View ref={anchor} collapsable={false} style={styles.title}>
                    <Text
                      variant="largeTitle"
                      accessibilityRole="header"
                      numberOfLines={1}
                      style={styles.titleText}
                    >
                      {crew.name}
                    </Text>
                    {caret}
                  </View>
                </PressableScale>
              </View>
            )}
            {crew === null ? (
              <PressableScale
                onPress={openSwitcher}
                accessibilityRole="button"
                accessibilityLabel={switcherLabel}
                testID="home-crew-switcher"
              >
                <View ref={anchor} collapsable={false} style={styles.crewLine}>
                  <Text variant="label" tone="muted">
                    {t({ id: 'home.header.yourCrews', message: 'Your crews' })}
                  </Text>
                  {caret}
                </View>
              </PressableScale>
            ) : noTrip ? (
              <View style={styles.crewLine} testID="home-crew-line">
                <CrewStack
                  members={crewAvatars(theme, crew)}
                  size={26}
                  max={6}
                  accessibilityLabel={crew.name}
                />
                <Text variant="label" tone="muted">
                  {t({
                    id: 'home.premium.crewLineNoTrip',
                    message: `${count} in the crew · no trip yet`,
                  })}
                </Text>
              </View>
            ) : null}
            {children}
          </ScrollView>
        )}
      </RootScreen>
      <PremiumDevTools />
      <View
        style={[
          styles.buttons,
          {
            top: insets.top + theme.space.gap6 - 2,
            end:
              crew === null
                ? theme.space.gutter + theme.size.glassNav + theme.space.gap8
                : theme.space.gutter,
          },
        ]}
      >
        {crew === null || view === null || view.uid === null ? null : (
          <CrewChatButton crewId={crew.id} uid={view.uid} />
        )}
        <GlassGlyphButton
          glyph="bell"
          label={t({ id: 'home.inbox.title', message: 'Inbox' })}
          count={needsYou}
          onPress={() => router.push(HOME_ROUTES.inbox)}
          testID="home-bell"
        />
      </View>
      <CrewSwitcherMenu
        visible={switcherTop !== null}
        top={switcherTop ?? 0}
        currentCrewId={crew?.id ?? null}
        onPick={(id) => onPick?.(id)}
        onClose={() => setSwitcherTop(null)}
      />
    </View>
  );
}

/** The crew chat, with the crew's unread messages as its badge (3.02). */
function CrewChatButton({ crewId, uid }: { readonly crewId: string; readonly uid: string }) {
  const { t } = useLingui();
  const unread = useChatUnread(crewId, uid);
  return (
    <GlassGlyphButton
      glyph="chat"
      label={t({ id: 'home.premium.chat', message: 'Crew chat' })}
      count={unread}
      onPress={() => router.push(crewChatRoute(crewId))}
      testID="home-chat"
    />
  );
}
