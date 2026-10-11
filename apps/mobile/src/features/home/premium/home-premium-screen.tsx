/**
 * The premium Home (3.01–3.04): a root screen titled with the crew, the bell (with the inbox
 * count) and the ink `+` that starts a vote. Under the title, the crew line opens the crew
 * switcher (3.07); the body follows the mode machine (./home-sections). A first sync shows the
 * real layout as shimmer with Pon bringing the trip over (3.03).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and SF Symbol names, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { CrewStack, Text, makePremiumStyles, usePremiumTheme, PressableScale } from '@/ui/premium';
import { RootScreen, type ShellAction } from '@/ui/premium/shell';

import {
  FIRST_SYNC_PATIENCE_MS,
  useElapsed,
  useHomeState,
  type HomeView,
} from '../data/use-home-state';
import { useRingHaptic } from '../home-header';
import { useAppBadge } from '../inbox/use-app-badge';
import { useInboxToast } from '../inbox/use-inbox-toast';
import { useOpenTrip } from '../join-trip-card';
import { useRecordAppOpen } from '../nudge/use-record-app-open';
import { HOME_ROUTES, homeRoutes } from '../routes';
import { CrewSwitcherMenu } from './crew-switcher/crew-switcher-menu';
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
  bell: { position: 'absolute', end: t.space.gutter + t.size.glassNav + t.space.gap8 },
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
        <CrewSection view={view} openTrip={openTrip} now={now} />
      )}
    </HomeFrame>
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
  const anchor = useRef<View>(null);
  const crew = view?.crew ?? null;
  const needsYou = view?.needsYou ?? 0;
  const title = crew?.name ?? t({ id: 'home.premium.title', message: 'Home' });
  const count = crew?.members.length ?? 0;

  const plus: ShellAction = {
    key: 'plus',
    label:
      crew === null
        ? t({ id: 'home.firstRun.startCrew', message: 'Start a crew' })
        : t({ id: 'home.premium.noTrip.cta', message: 'Start the vote' }),
    sfSymbol: 'plus',
    glyph: 'plus',
    primary: true,
    testID: 'home-plus',
    onPress: () => {
      const href = crew === null ? undefined : homeRoutes.pitch(crew.id);
      router.push(href ?? '/crew/new');
    },
  };
  const openSwitcher = () => {
    const node = anchor.current as Measurable | null;
    node?.measureInWindow((_x, y, _w, h) => setSwitcherTop(y + h));
  };

  return (
    <View style={{ flex: 1 }} testID="home-screen">
      <RootScreen title={title} actions={[plus]} header="drawn">
        {({ scrollProps, largeTitle }) => (
          <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
            {largeTitle}
            <PressableScale
              onPress={openSwitcher}
              accessibilityRole="button"
              accessibilityLabel={t({ id: 'home.premium.switcher.open', message: 'Switch crew' })}
              testID="home-crew-switcher"
            >
              <View ref={anchor} collapsable={false} style={styles.crewLine}>
                {crew === null ? null : (
                  <CrewStack
                    members={crewAvatars(theme, crew)}
                    size={26}
                    max={6}
                    accessibilityLabel={crew.name}
                  />
                )}
                <Text variant="label" tone="muted">
                  {crew === null
                    ? t({ id: 'home.header.yourCrews', message: 'Your crews' })
                    : t({ id: 'home.premium.crewLine', message: `${count} in the crew` })}
                </Text>
                <HomeGlyph
                  name={switcherTop === null ? 'chevronDown' : 'chevronUp'}
                  size={16}
                  color={theme.color.muted}
                />
              </View>
            </PressableScale>
            {children}
            <PremiumDevTools />
          </ScrollView>
        )}
      </RootScreen>
      <View style={[styles.bell, { top: insets.top + theme.space.gap6 - 2 }]}>
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
