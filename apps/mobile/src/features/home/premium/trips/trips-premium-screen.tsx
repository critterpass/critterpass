/**
 * The premium Trips tab (3.05, 3.06): always the list, never a single trip's hub. The live trip
 * leads and zooms into its hub; "Coming up" is a two-column grid opening each trip's hub; trips
 * that are over are quiet rows opening their recap. The filter narrows the list on the Snappy
 * spring; with no trips the page is the empty passport. The ink `+` starts a vote in the crew.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, filter values and SF Symbols. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  ListCard,
  Row,
  SegmentedControl,
  Skeleton,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';
import { RootScreen, type ShellAction } from '@/ui/premium/shell';

import { tripDay } from '../../format';
import { guideArt } from '../../guide-art';
import { HOME_ROUTES, homeRoutes } from '../../routes';
import { tripDayOf } from '../../trip-day';
import { LiveTripCard } from '../components/live-trip-card';
import { Polaroid } from '../components/polaroid';
import { EmptyPassport } from './empty-passport';
import { TripMiniCard } from './trip-mini-card';
import { splitTrips, type TripsFilter } from './trips-model';
import { usePremiumTrips } from './use-premium-trips';

const useStyles = makePremiumStyles((t) => ({
  content: {
    paddingHorizontal: t.space.gutter,
    paddingBottom: t.space.tabBarClearance,
    gap: t.space.gap16,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: t.space.gap8,
    marginTop: t.space.gap4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.gap10 },
  half: { width: '48.5%' },
  filter: { alignSelf: 'flex-start' },
}));

export function TripsPremiumScreen() {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const trips = usePremiumTrips();
  const [filter, setFilter] = useState<TripsFilter>('all');
  const lists = splitTrips(trips.rows, filter);
  const now = new Date();
  const pitch = () => {
    const href = trips.crewId === null ? undefined : homeRoutes.pitch(trips.crewId);
    router.push(href ?? '/crew/new');
  };
  const plus: ShellAction = {
    key: 'plus',
    label: t({ id: 'home.premium.noTrip.cta', message: 'Start the vote' }),
    sfSymbol: 'plus',
    glyph: 'plus',
    primary: true,
    onPress: pitch,
    testID: 'trips-plus',
  };
  // The design's search opens the place search, where a crew finds where to go next.
  const placeSearch = homeRoutes.placeSearch();
  const search: ShellAction | null =
    placeSearch === undefined
      ? null
      : {
          key: 'search',
          label: t({ id: 'home.premium.trips.search', message: 'Search places' }),
          sfSymbol: 'magnifyingglass',
          glyph: 'search',
          onPress: () => router.push(placeSearch),
          testID: 'trips-search',
        };
  const empty = trips.loaded && lists.total === 0;
  const count = lists.total;
  const comingCount = lists.coming.length;
  const live = lists.live;
  const liveDay =
    live === null
      ? null
      : tripDayOf(
          { status: live.status, startDate: live.start_date, endDate: live.end_date, tz: live.tz },
          now,
        );

  return (
    <RootScreen
      title={t({ id: 'common.shell.tabTrips', message: 'Trips' })}
      actions={empty ? [] : search === null ? [plus] : [search, plus]}
      testID="trip-list"
    >
      {({ scrollProps, largeTitle }) => (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
          {largeTitle}
          {!trips.loaded ? (
            <View style={{ gap: theme.space.gap16 }} testID="trip-list-loading">
              <Skeleton height={312} radius={34} tone="block" />
              <Skeleton width={120} height={16} radius={8} />
              <Skeleton height={142} radius={26} tone="block" />
            </View>
          ) : empty ? (
            <EmptyPassport onPitch={pitch} onJoin={() => router.push(HOME_ROUTES.joinCode)} />
          ) : (
            <>
              <View style={styles.filter}>
                <SegmentedControl<TripsFilter>
                  hug
                  options={[
                    {
                      value: 'all',
                      label: t({ id: 'home.premium.trips.all', message: `All · ${count}` }),
                    },
                    {
                      value: 'planning',
                      label: t({ id: 'home.premium.trips.planningTab', message: 'Planning' }),
                    },
                    {
                      value: 'home',
                      label: t({ id: 'home.premium.trips.homeTab', message: 'Home again' }),
                    },
                  ]}
                  value={filter}
                  onChange={setFilter}
                  accessibilityLabel={t({ id: 'home.inbox.filters', message: 'Show' })}
                  testID="trips-filter"
                />
              </View>
              {live === null ? null : (
                <LiveTripCard
                  tripId={live.id}
                  place={live.destination_name ?? ''}
                  slug={live.destination_slug}
                  guideKind={guideArt(live.guide_slug).kind}
                  day={liveDay?.day ?? 1}
                  days={liveDay?.days ?? 1}
                  members={[]}
                />
              )}
              {lists.coming.length === 0 ? null : (
                <>
                  <View style={styles.section}>
                    <Text variant="navTitle">
                      {t({ id: 'home.premium.trips.coming', message: 'Coming up' })}
                    </Text>
                    <Text variant="label" tone="muted">
                      {t({
                        id: 'home.premium.trips.comingCount',
                        message: plural(comingCount, { one: '# trip', other: '# trips' }),
                      })}
                    </Text>
                  </View>
                  <View style={styles.grid}>
                    {lists.coming.map((trip, index) => (
                      <View key={trip.id} style={styles.half}>
                        <TripMiniCard
                          trip={trip}
                          index={index}
                          onPress={() => router.push(`/hub/${trip.id}`)}
                        />
                      </View>
                    ))}
                  </View>
                </>
              )}
              {lists.past.length === 0 ? null : (
                <ListCard radius={22} earlier>
                  {lists.past.map((trip) => {
                    const place = trip.destination_name ?? '';
                    const recap = homeRoutes.recap(trip.id);
                    return (
                      <Row
                        key={trip.id}
                        title={t({
                          id: 'home.premium.trips.homeAgain',
                          message: `${place} · home again`,
                        })}
                        subtitle={t({
                          id: 'home.premium.trips.recapReady',
                          message: 'Recap ready',
                        })}
                        {...(trip.start_date === null
                          ? {}
                          : { trailingText: tripDay(locale, trip.start_date) })}
                        leading={
                          <Polaroid
                            slug={trip.destination_slug}
                            width={40}
                            height={44}
                            rotate={-4}
                          />
                        }
                        onPress={() => router.push(recap ?? `/hub/${trip.id}`)}
                        testID={`trip-list-row-${trip.id}`}
                      />
                    );
                  })}
                </ListCard>
              )}
            </>
          )}
        </ScrollView>
      )}
    </RootScreen>
  );
}
