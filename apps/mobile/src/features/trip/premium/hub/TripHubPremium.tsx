/**
 * The trip hub in the premium UI (1.05, 6.01–6.03): the destination's hero, Today / Plan / Map /
 * Money, then Today itself: what needs the reader (disruptions), the guide's briefing, the four
 * doors, what is next and the crew's ticker. It renders from synced rows, so it opens offline; a
 * trip day with no signal points at the saved day. A called-off trip keeps its name, chat, money
 * and bookings. The trip's one way out (call off, delete, leave) sits behind the ⋯ circle.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { shortName } from '@/lib/people/member-name';
import { heroAt } from '@/data/media/use-subject-media';
import { useLocale } from '@/lib/i18n/use-locale';
import {
  Banner,
  Card,
  GuideNote,
  OfflinePill,
  PressableScale,
  Skeleton,
  Text,
  usePremiumTheme,
} from '@/ui/premium';
import {
  confirmAlert,
  SCROLL_EDGE_FADE,
  ScrollEdgeFade,
  useScrollEdges,
  ZoomTarget,
} from '@/ui/premium/shell';

import { tripDates } from '../../hub/hub-copy';
import type { HubHeader } from '../../hub/hub-model';
import { useTripHub } from '../../hub/use-trip-hub';
import { useTripRemoval } from '../../hub/use-trip-removal';
import { crewAccent } from '../components/crew-accent';
import { guideCritterKind } from '../components/guide-critter';
import { ActivityTicker } from './ActivityTicker';
import { HubBriefing } from './HubBriefing';
import { HubHero } from './HubHero';
import { HubSwitch, type HubDoor } from './HubSwitch';
import { HubTiles } from './HubTiles';
import { TodayList } from './TodayList';
import { VisitConsentLine } from './VisitConsentLine';
import { tripZoomId } from './zoom-id';

export interface TripHubPremiumProps {
  readonly tripId: string;
  readonly onBack: () => void;
}

function useCaption(
  header: HubHeader,
  start: string | null,
  end: string | null,
  going: number,
): string | null {
  const locale = useLocale();
  const { t } = useLingui();
  if (header.phase === 'in') {
    const { day: dayNo, days } = header;
    return t({ id: 'trip.hub.dayOf', message: `Day ${dayNo} of ${days}` });
  }
  if (start === null) return null;
  const dates = tripDates(locale, start, end);
  return going > 0
    ? t({ id: 'trip.hub.premium.datesGoing', message: `${dates} · ${going} going` })
    : dates;
}

export function TripHubPremium({ tripId, onBack }: TripHubPremiumProps) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const hub = useTripHub(tripId, null);
  const { trip } = hub;
  // Once the hero has scrolled up under the status bar, the page grounds the status bar (the
  // clock sat over the briefing) and goes back to the theme's status bar content.
  const [heroHeight, setHeroHeight] = useState(0);
  const edges = useScrollEdges({ topAfter: Math.max(0, heroHeight - insets.top) });
  const removal = useTripRemoval({
    tripId,
    status: trip?.status ?? '',
    role: trip?.role ?? null,
    me: hub.me,
  });
  const caption = useCaption(
    hub.header,
    trip?.start_date ?? null,
    trip?.end_date ?? null,
    hub.rows.going,
  );
  const loading = !hub.rows.loaded || trip === null;
  const crew = hub.rows.members.map((member, index) => ({
    id: member.user_id,
    name: (member.display_name ?? '').trim() === '' ? '' : shortName(member.display_name),
    color: crewAccent(index),
  }));
  const tile = (key: string) => hub.builtTiles.find((item) => item.key === key)?.onPress;
  const doors: HubDoor[] = [];
  const openPlan = tile('plan');
  if (openPlan !== undefined) doors.push({ key: 'plan', onPress: openPlan });
  if (!hub.calledOff && trip !== null) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, not copy
    doors.push({ key: 'map', onPress: () => router.push(`/map/${tripId}`) });
  }
  const openMoney = tile('money');
  if (openMoney !== undefined) doors.push({ key: 'money', onPress: openMoney });
  const onMenu =
    removal.kind === 'ready'
      ? () => {
          const { copy } = removal;
          void confirmAlert({
            title: copy.title,
            message: copy.lines.join('\n'),
            confirm: copy.confirm,
            cancel: t({ id: 'trip.hub.premium.keep', message: 'Cancel' }),
          }).then((yes) => {
            if (yes) removal.confirm(() => undefined);
          });
        }
      : null;
  const registered =
    trip === null
      ? []
      : hub.registeredTiles.map(({ key, Tile }) => ({
          key,
          node: <Tile tripId={tripId} crewId={trip.crew_id} />,
        }));
  const next = [
    ...hub.disruptions,
    ...hub.entries,
    ...(hub.swipe === null ? [] : [hub.swipe]),
    ...(hub.explore === null ? [] : [hub.explore]),
  ];
  const openOffline = hub.offline?.onOpenOffline ?? null;
  return (
    <View style={[styles.root, { backgroundColor: th.color.ground }]} testID="trip-hub">
      <ScrollView
        {...edges.scrollProps}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40, gap: th.space.gap16 }}
        contentInsetAdjustmentBehavior="never"
      >
        <ZoomTarget zoomId={tripZoomId(tripId)}>
          <View onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)}>
            <HubHero
              destination={hub.destination}
              caption={caption}
              header={hub.header}
              media={heroAt(hub.heroMedia.items)}
              crew={crew}
              onBack={onBack}
              onMenu={onMenu}
              scrolledPast={edges.top}
            />
          </View>
        </ZoomTarget>
        {doors.length > 0 ? <HubSwitch doors={doors} /> : null}
        {hub.offlinePill === null ? null : (
          <PressableScale
            onPress={hub.offlinePill.onPress}
            accessibilityRole="button"
            style={{ paddingHorizontal: th.space.offlinePillInset }}
            testID="trip-hub-offline-pill"
          >
            <OfflinePill />
          </PressableScale>
        )}
        {hub.dayCard && openOffline !== null ? (
          <View style={{ paddingHorizontal: th.space.gap16 }}>
            <Banner
              tone="info"
              text={t({
                id: 'trip.hub.premium.offlineDay',
                message: "No signal. Today's plan, passes and phrases are saved on this phone.",
              })}
              action={{
                label: t({ id: 'trip.hub.premium.offlineOpen', message: 'Open' }),
                onPress: openOffline,
              }}
              testID="trip-hub-offline-day"
            />
          </View>
        ) : null}
        {loading ? (
          <View style={{ paddingHorizontal: th.space.gutter, gap: th.space.gap12 }}>
            <Skeleton height={180} radius={th.radius.cardLarge} />
            <Skeleton height={118} radius={th.radius.cardRow} />
          </View>
        ) : (
          <>
            {hub.calledOff ? (
              <View style={{ paddingHorizontal: th.space.gutter }}>
                <Card testID="trip-cancelled-note">
                  <Text variant="rowText" tone="inkSecondary">
                    {t({
                      id: 'trip.menu.cancelledNote',
                      message:
                        'This trip was called off. The chat, money, bookings and photos stay here.',
                    })}
                  </Text>
                </Card>
              </View>
            ) : null}
            <TodayList entries={hub.disruptions} />
            <HubBriefing
              state={hub.briefing}
              guideKind={guideCritterKind(hub.guide)}
              guideName={hub.guideName}
              onAct={hub.onAct}
            />
            <HubTiles tiles={hub.builtTiles} extra={registered} />
            <TodayList entries={next.slice(hub.disruptions.length)} />
            {hub.planning === null ? null : (
              <View style={{ paddingHorizontal: th.space.gap16 }}>
                <GuideNote
                  name={hub.guideName}
                  critter={guideCritterKind(hub.guide)}
                  text={hub.planning.note ?? hub.planning.label ?? ''}
                  {...(hub.planning.onPress === undefined || hub.planning.label === undefined
                    ? {}
                    : { action: { label: hub.planning.label, onPress: hub.planning.onPress } })}
                  testID="trip-hub-planning"
                />
              </View>
            )}
            <ActivityTicker items={hub.ticker} />
            {hub.calledOff ? null : <VisitConsentLine />}
          </>
        )}
      </ScrollView>
      <ScrollEdgeFade
        edge="top"
        height={insets.top + SCROLL_EDGE_FADE * 2}
        solid={insets.top + SCROLL_EDGE_FADE / 2}
        visible={edges.top}
        testID="trip-hub-top-ground"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
