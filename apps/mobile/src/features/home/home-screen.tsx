/**
 * Home: crew-scoped and drawn from synced rows only, so it renders offline and counts down locally.
 * The mode machine picks what shows: first run (3b-1), everyday (3b-2), final vote (3b-6) and the
 * undesigned no-trip, in-trip and post-trip modes. A mode change cross-fades; the vote board comes
 * from the poll feature's slot. A member who is not on the crew's locked-in trip gets the way on
 * (or their place on its waitlist) above the trip's card. The skeleton shows only on a first sync with nothing local.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { LocalFirstContext, useLocalFirst } from '@/data/powersync/local-first-context';
import { WaitlistCards } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  FIRST_SYNC_PATIENCE_MS,
  useElapsed,
  useHomeState,
  type HomeView,
} from './data/use-home-state';
import { DevToolsEntry } from './dev-tools-entry';
import { FadeInView } from './fade-in-view';
import { FirstRunGrid, guideCells } from './first-run-grid';
import { HomeHeaderBar } from './home-header';
import { useAppBadge } from './inbox/use-app-badge';
import { JoinTripCard, useOpenTrip } from './join-trip-card';
import { useRecordAppOpen } from './nudge/use-record-app-open';
import { NextUpCard } from './next-up-card';
import { HOME_ROUTES } from './routes';
import { homeVoteSlot } from './slots';
import { TipStrip } from './tip-strip';
import { InTripCard, NoTripCard, PostTripCard } from './trip-state-cards';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
}));

function FirstRun({
  view,
  width,
}: {
  readonly view: Pick<HomeView, 'firstName' | 'guideCells'>;
  readonly width: number;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const theme = useTheme();
  const welcome =
    view.firstName === ''
      ? t({ id: 'home.firstRun.welcomeAnon', message: 'Welcome' })
      : t({ id: 'home.firstRun.welcome', message: `Welcome, ${view.firstName}` });
  return (
    <Stack gap="16" testID="home-first-run">
      <Row justify="space-between" align="center">
        <Text variant="eyebrow" numberOfLines={1} style={{ flexShrink: 1 }}>
          {upper(welcome, locale)}
        </Text>
        <InlineAction
          kind="choice"
          label={upper(t({ id: 'home.firstRun.joinCode', message: 'Join with a code' }), locale)}
          onPress={() => router.push(HOME_ROUTES.joinCode)}
          testID="home-join-code"
        />
      </Row>
      <Text variant="displayXl" numberOfLines={2} accessibilityRole="header">
        {upper(t({ id: 'home.firstRun.title', message: 'Where to first?' }), locale)}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary}>
        {t({
          id: 'home.firstRun.body',
          message: 'Pick a guide to start a trip. Your crew can vote on it later.',
        })}
      </Text>
      <FirstRunGrid cells={guideCells(view.guideCells)} width={width} />
    </Stack>
  );
}

function VoteSection({ view }: { readonly view: HomeView }) {
  const slot = homeVoteSlot();
  const vote = view.home.vote;
  if (slot === null || vote === null || view.crew === null) return null;
  return <slot.Component crewId={view.crew.id} vote={vote} />;
}

function CrewHome({ view }: { readonly view: HomeView }) {
  const { home, crew, tip } = view;
  const localFirst = useLocalFirst();
  const openTrip = useOpenTrip(view.uid, crew?.id ?? null);
  if (crew === null) return null;
  // A trip still choosing its place has nothing to count down to: its vote, drawn below, is the
  // crew's next thing, so the card doesn't repeat it as "Your next trip".
  const votingIsNextUp =
    home.nextTrip?.destinationId === null && home.vote !== null && homeVoteSlot() !== null;
  const showTip =
    tip !== null &&
    (home.mode === 'everyday' || home.mode === 'no_trip' || home.mode === 'post_trip');
  return (
    <Stack gap="20" testID={`home-mode-${home.mode}`}>
      {/* Not on the crew's locked-in trip: the way on, or their place in line for a seat. */}
      {openTrip === null ? null : <JoinTripCard trip={openTrip} crewName={crew.name} />}
      <WaitlistCards
        db={localFirst.db}
        uid={view.uid}
        commands={localFirst.commands}
        now={new Date()}
        crewId={crew.id}
      />
      {home.mode === 'in_trip' && home.activeTrip !== null ? (
        <InTripCard trip={home.activeTrip} now={new Date()} />
      ) : null}
      {(home.mode === 'everyday' || home.mode === 'final_vote') &&
      home.nextTrip !== null &&
      !votingIsNextUp ? (
        <NextUpCard trip={home.nextTrip} />
      ) : null}
      {home.mode === 'post_trip' && home.recentTrip !== null ? (
        <PostTripCard trip={home.recentTrip} />
      ) : null}
      {home.mode === 'no_trip' ? <NoTripCard crewId={crew.id} lastTrip={home.lastTrip} /> : null}
      {home.mode === 'everyday' || home.mode === 'final_vote' ? <VoteSection view={view} /> : null}
      {showTip ? <TipStrip key={tip.id} tip={tip} /> : null}
    </Stack>
  );
}

export interface HomeScreenProps {
  /** A crew a link asked Home to show (the invite hand-off), when the user is in it. */
  readonly crewId?: string | null;
}

/** First sync (or no session yet): skeleton blocks, and the Developer tools link stays reachable. */
function HomeLoading() {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const inset = useTabBarInset();
  return (
    <Scaffold variant="dark" testID="home-loading">
      <View style={styles.content}>
        <Skeleton preset="lines" label={t({ id: 'home.loading', message: 'Loading your home' })} />
        <Skeleton preset="card" />
        <Skeleton preset="card" />
      </View>
      <DevToolsEntry bottom={inset + theme.space['4']} />
    </Scaffold>
  );
}

/** Home waits for the session's local database: until it opens there is nothing to read yet. */
export function HomeScreen(props: HomeScreenProps) {
  const localFirst = useContext(LocalFirstContext);
  const patienceOver = useElapsed(FIRST_SYNC_PATIENCE_MS);
  if (localFirst !== null) return <HomeContent {...props} />;
  // No session yet (a first launch offline): nothing of the user's can exist locally, so after a
  // short wait Home shows the first run rather than a skeleton that may never resolve.
  return patienceOver ? <SessionlessFirstRun /> : <HomeLoading />;
}

const NO_CELLS: HomeView['guideCells'] = [];

function SessionlessFirstRun() {
  const styles = useStyles();
  const theme = useTheme();
  const inset = useTabBarInset();
  const { width } = useWindowDimensions();
  return (
    <Scaffold variant="dark" testID="home-screen">
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset + theme.space['32'] }]}
      >
        <FirstRun
          view={{ firstName: '', guideCells: NO_CELLS }}
          width={width - 2 * theme.size.gutter}
        />
      </ScrollView>
      <DevToolsEntry bottom={inset + theme.space['4']} />
    </Scaffold>
  );
}

function HomeContent({ crewId = null }: HomeScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const view = useHomeState(crewId);
  useAppBadge(view.needsYou, view.status === 'ready');
  useRecordAppOpen();
  const inset = useTabBarInset();
  const { width } = useWindowDimensions();
  const contentWidth = width - 2 * theme.size.gutter;

  if (view.status === 'loading') return <HomeLoading />;

  const mode = view.home.mode;
  return (
    <Scaffold variant="dark" testID="home-screen">
      {view.crew !== null && view.uid !== null ? (
        <HomeHeaderBar
          name={view.firstName}
          crew={view.crew}
          needsYou={view.needsYou}
          uid={view.uid}
        />
      ) : null}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: inset + theme.space['32'] }]}
      >
        <FadeInView key={`${view.crew?.id ?? 'none'}-${mode}`}>
          {mode === 'first_run' ? (
            <FirstRun view={view} width={contentWidth} />
          ) : (
            <CrewHome view={view} />
          )}
        </FadeInView>
      </ScrollView>
      <DevToolsEntry bottom={inset + theme.space['4']} />
    </Scaffold>
  );
}
