/**
 * Home: crew-scoped and drawn from synced rows only, so it renders offline and counts down locally.
 * The mode machine picks what shows: first run (3b-1), everyday (3b-2), final vote (3b-6) and the
 * undesigned no-trip, in-trip and post-trip modes. A mode change cross-fades; the vote board comes
 * from the poll feature's slot. The skeleton shows only on a first sync with nothing local.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, useWindowDimensions, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { useTabBarInset } from '@/ui/shell/TabBar';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { useHomeState, type HomeView } from './data/use-home-state';
import { DevToolsEntry } from './dev-tools-entry';
import { FadeInView } from './fade-in-view';
import { FirstRunGrid, guideCells } from './first-run-grid';
import { HomeHeaderBar } from './home-header';
import { useAppBadge } from './inbox/use-app-badge';
import { useRecordAppOpen } from './nudge/use-record-app-open';
import { NextUpCard } from './next-up-card';
import { HOME_ROUTES } from './routes';
import { homeVoteSlot } from './slots';
import { TipStrip } from './tip-strip';
import { InTripCard, NoTripCard, PostTripCard } from './trip-state-cards';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['20'], paddingTop: t.space['8'] },
}));

function FirstRun({ view, width }: { readonly view: HomeView; readonly width: number }) {
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
        <PillButton
          size="sm"
          variant="secondary"
          label={upper(t({ id: 'home.firstRun.joinCode', message: 'Join with a code' }), locale)}
          onPress={() => router.push(HOME_ROUTES.joinCode)}
          testID="home-join-code"
        />
      </Row>
      <Text variant="h1" accessibilityRole="header">
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
  if (crew === null) return null;
  const showTip =
    tip !== null &&
    (home.mode === 'everyday' || home.mode === 'no_trip' || home.mode === 'post_trip');
  return (
    <Stack gap="20" testID={`home-mode-${home.mode}`}>
      {home.mode === 'in_trip' && home.activeTrip !== null ? (
        <InTripCard trip={home.activeTrip} now={new Date()} />
      ) : null}
      {(home.mode === 'everyday' || home.mode === 'final_vote') && home.nextTrip !== null ? (
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

export function HomeScreen({ crewId = null }: HomeScreenProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const view = useHomeState(crewId);
  useAppBadge(view.needsYou, view.status === 'ready');
  useRecordAppOpen();
  const inset = useTabBarInset();
  const { width } = useWindowDimensions();
  const contentWidth = width - 2 * theme.size.gutter;

  if (view.status === 'loading') {
    return (
      <Scaffold variant="dark" testID="home-loading">
        <View style={styles.content}>
          <Skeleton
            preset="lines"
            label={t({ id: 'home.loading', message: 'Loading your home' })}
          />
          <Skeleton preset="card" />
          <Skeleton preset="card" />
        </View>
        <DevToolsEntry bottom={inset + theme.space['4']} />
      </Scaffold>
    );
  }

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
