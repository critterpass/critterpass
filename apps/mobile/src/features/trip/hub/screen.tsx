/**
 * The trip hub (3k-1) over synced rows: the phase header and its countdown, the next thing, the
 * guide's briefing with its chips, the PLAN / BOOKINGS / MONEY tiles plus registered ones, and the
 * crew's ticker. With no signal on a trip day the header gives way to the offline card; any other
 * day the hub stays and says so. A called-off trip keeps its name, dates, chat, bookings and money.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, route paths and tile keys, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import type { Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { useLocale } from '@/lib/i18n/use-locale';
import { useNow } from '@/lib/time/use-now';
import { VisitConsentRow } from '@/ui/permission-primer';
import { useTripTurnView } from '@/features/home';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';

import { briefingClock, briefingState } from '../briefing/briefing-model';
import { BUNDLE_KIND, savedDayId } from '../bundle/bundle-manager';
import { OfflineView } from '../offline/offline-view';
import { useOffline } from '../offline/use-offline';
import { useBriefingActions } from '../briefing/chip-actions';
import { useLiveRows, useOwnerUid } from './data/live-rows';
import { useMediaLowData } from '../media/use-media-low-data';
import { MY_TRIP_COUNT_SQL, MY_TRIP_COUNT_TABLES } from './data/queries';
import { useHubRows } from './data/use-hub';
import { guideColour, guideName as nameOf, guideOr } from './guide';
import { bookingsTile, moneyTile, planTile, tickerLines, wholeMoney } from './hub-copy';
import { activityHref, HOME, planningLink } from './hub-links';
import { hubHeader, offersSwipe, offlineCardPhase, viewerNet, type HubFlight } from './hub-model';
import { exploreEntry, hubEntries, swipeEntry } from './hub-next';
import {
  builtInTiles,
  chatEntry,
  go,
  goTab,
  todayComplete,
  useDisruptionRows,
} from './hub-screen-rows';
import { hubPlanning, planTileBeforeSend, planTileWhileVoting, planVoteEntry } from './hub-turn';
import { HubView } from './hub-view';
import { HubTile, useRegisteredHubTiles } from './tiles';
import { useTripMenu } from './trip-menu';

export interface TripHubScreenProps {
  readonly tripId: string;
  readonly onSwitch: (() => void) | null;
}

export function TripHubScreen({ tripId, onSwitch }: TripHubScreenProps) {
  const me = useOwnerUid();
  const locale = useLocale();
  const { t } = useLingui();
  // The screen reads the clock once a minute; the header counts its own seconds. The moment the
  // countdown's target passes is read too, so the phase turns over on time.
  const tick = useNow(60_000);
  const [reached, setReached] = useState<Date | null>(null);
  const now = reached !== null && reached.getTime() > tick.getTime() ? reached : tick;
  const minute = Math.floor(now.getTime() / 60_000);
  const minuteIso = useMemo(() => new Date(minute * 60_000).toISOString(), [minute]);
  // The phone's own zone, read again each minute (it changes when the phone lands somewhere).
  const tzGuess = useMemo(() => {
    void minute;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, [minute]);
  const tripTz = useLiveRows<{ tz: string | null }>(
    'SELECT coalesce(t.tz, d.tz) AS tz FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?',
    [tripId],
    ['trips', 'destinations'],
  ).rows[0]?.tz;
  const tz = tripTz ?? tzGuess;
  const today = toLocalWallTime(new Date(minute * 60_000), tz).date;
  const rows = useHubRows(tripId, me, today, minuteIso);
  const offline = useOffline(tripId);
  const offlineNode = offline === null ? null : <OfflineView {...offline} />;
  const unread = offline?.conflictsOnly === true;
  const noSignal = offline !== null && !unread;
  const savedToday = useLiveRows<{ data: string }>(
    'SELECT data FROM local_private WHERE kind = ? AND id = ?',
    [BUNDLE_KIND, savedDayId(tripId, today)],
    ['local_private'],
  ).rows[0];
  const bookingsOffline = savedToday !== undefined && todayComplete(savedToday.data);
  const registered = useRegisteredHubTiles();
  const swipeHref = useScreenHref('7g-2', { tripId });
  const recapHref = useScreenHref('3m-1', { tripId });
  const rateHref = useScreenHref('3o-3', { tripId });
  const sharePlanHref = useScreenHref('3o-4', { tripId });
  const exploreHref = useScreenHref('7g-1', { tripId });
  const myTrips = useLiveRows<{ n: number }>(
    MY_TRIP_COUNT_SQL,
    me === null ? null : [me],
    MY_TRIP_COUNT_TABLES,
  ).rows[0]?.n;
  // The switch is for an account with another trip to go to; with one, there is nowhere to switch.
  const switchTrip = (myTrips ?? 0) > 1 ? onSwitch : null;
  const names = useMemo(
    () => new Map(rows.members.map((row) => [row.user_id, row.display_name ?? ''])),
    [rows.members],
  );
  const onAct = useBriefingActions(names);
  const trip = rows.trip;
  // No role until the trip row is in: the menu offers nothing while it loads.
  const menu = useTripMenu({
    tripId,
    status: trip?.status ?? '',
    role: trip?.role ?? null,
    me,
  });
  const mediaLowData = useMediaLowData();
  const heroMedia = useDestinationMedia(trip?.destination_slug ?? null, {
    prefetch: !mediaLowData,
  });
  const guide = guideOr(trip?.guide_slug);
  const name = nameOf(guide, trip?.guide_name);

  const flights: HubFlight[] = rows.flights.map((flight) => ({
    id: flight.id,
    title: flight.title,
    departsAt: new Date(flight.starts_at),
    arrivesAt: flight.ends_at === null ? null : new Date(flight.ends_at),
  }));
  const header =
    trip === null
      ? ({ phase: 'planning' } as const)
      : hubHeader(
          {
            status: trip.status,
            startDate: trip.start_date,
            endDate: trip.end_date,
            tz,
            countdownTargetAt: trip.countdown_target_at,
            landedAt: trip.landed_at,
          },
          flights,
          now,
        );

  const calledOff = header.phase === 'cancelled';
  // The trip-day card is for a day that is lived offline; any other day the hub only says so.
  const dayCard = noSignal && offlineCardPhase(header, now);
  const offlineCard = dayCard ? offlineNode : null;
  const offlinePill =
    noSignal && !dayCard && (offline.card.chip === 'offline' || offline.card.chip === 'weak');
  const disruptions = useDisruptionRows(tripId, trip !== null && !calledOff);

  const targetMs =
    header.phase === 'pre' || header.phase === 'travel' ? header.target.getTime() : null;
  useEffect(() => {
    if (targetMs === null) return undefined;
    const left = targetMs - Date.now();
    if (left <= 0 || left >= 60_000) return undefined;
    const timer = setTimeout(() => setReached(new Date()), left);
    return () => clearTimeout(timer);
  }, [targetMs, minute]);

  const entries = hubEntries({
    header,
    tripId,
    startDate: trip?.start_date ?? null,
    leaveBy: rows.leaveBy,
    nextItem: rows.next,
    today,
    tz,
    locale,
    recap: go(recapHref),
    rate: go(rateHref),
    sharePlan: go(sharePlanHref),
  });

  const start = trip?.start_date ?? null;
  const briefing = briefingState({
    read: rows.briefingRead,
    briefing: rows.briefing,
    items: rows.briefingItems,
    pending: rows.pendingActs,
    clock: briefingClock(new Date(minute * 60_000), {
      startDate: start,
      tripTz: tz,
      ownTz: tzGuess,
    }),
    offline: noSignal,
    briefed: header.phase === 'pre' || header.phase === 'travel' || header.phase === 'in',
    startDate: start,
    endDate: trip?.end_date ?? null,
    locale,
  });

  const turn = useTripTurnView(trip === null ? null : tripId, { locale, guide: name });
  const draftHref = useScreenHref('3c-9', { tripId });
  // While the crew votes there is no plan yet, whatever the turn has (or has not) worked out.
  const planBeforeSend =
    trip?.status === 'voting' ? planTileWhileVoting() : planTileBeforeSend(turn, draftHref);
  const net = me === null ? null : viewerNet(rows.ledger, me, trip?.local_currency ?? null);
  const plan = planBeforeSend ?? {
    ...planTile(rows.days, rows.openVotes.length, rows.dayTrips),
    href: hrefFor('plan-hub', { tripId }),
  };
  const tiles = [
    ...builtInTiles({
      tripId,
      // A called-off trip keeps what was said, spent and booked; its plan is not a thing to open.
      plan: calledOff ? null : plan,
      bookings: bookingsTile(rows.bookings, bookingsOffline),
      money: moneyTile(
        net === null ? null : wholeMoney(locale, net.amountMinor, net.currency),
        net === null ? 0 : Math.sign(net.amountMinor),
      ),
    }).map((tile) => ({ key: tile.key, node: <HubTile tile={tile} /> })),
    ...(trip === null || calledOff
      ? []
      : registered.map(({ key, Tile }) => ({
          key,
          node: <Tile tripId={tripId} crewId={trip.crew_id} />,
        }))),
  ];

  // Shown once Explore's screen is registered: a row that opens nothing is not drawn.
  const exploreAction = go(exploreHref);
  const explore =
    calledOff || trip?.destination_name == null || exploreAction === undefined
      ? null
      : exploreEntry(trip.destination_name, exploreAction);
  // The crew's swipe, once its screen is registered.
  const swipeAction =
    trip === null || !offersSwipe(header, trip.status) ? undefined : go(swipeHref);
  const swipe = swipeAction === undefined ? null : swipeEntry(swipeAction);
  const planning = hubPlanning(
    turn,
    trip === null ? null : planningLink(tripId, trip.status, rows.openVotes[0]),
  );
  const open = (href: Href | undefined) => (href === HOME ? goTab(href) : go(href));
  const planningAction = planning === null ? undefined : open(planning.href);

  return (
    <HubView
      state={rows.loaded && trip !== null ? 'ready' : 'loading'}
      header={header}
      startDate={trip?.start_date ?? null}
      endDate={trip?.end_date ?? null}
      going={rows.going}
      // A trip still choosing its place asks the crew's question (Home's heading while voting).
      destination={
        trip?.destination_name ?? t({ id: 'trip.hub.whereNext', message: 'Where next?' })
      }
      colour={guideColour(guide)}
      heroMedia={heroAt(heroMedia.items)}
      mediaLowData={mediaLowData}
      guide={guide}
      guideName={name}
      guestGuide={trip?.is_guest_guide === 1}
      planning={
        planning === null || (planning.note === undefined && planningAction === undefined)
          ? null
          : { note: planning.note, label: planning.label, onPress: planningAction }
      }
      crewSize={rows.members.length}
      entries={
        calledOff
          ? trip === null
            ? []
            : [chatEntry(trip.crew_id)]
          : [...planVoteEntry(turn, go(turn?.href)), ...entries]
      }
      disruptions={disruptions}
      offlinePill={offlinePill}
      briefing={briefing}
      onAct={onAct}
      tiles={tiles}
      explore={explore}
      swipe={swipe}
      visitConsent={calledOff ? null : <VisitConsentRow />}
      ticker={tickerLines(rows.activity, trip?.status ?? null, trip?.role === 'organiser').map(
        ({ row, text }) => {
          const onPress = open(activityHref(row, tripId, trip?.status ?? null));
          return { id: row.id, text, ...(onPress === undefined ? {} : { onPress }) };
        },
      )}
      onSwitch={switchTrip}
      {...(offlineCard === null ? {} : { offlineCard })}
      {...(unread ? { offlineConflicts: offlineNode } : {})}
      menu={menu.foot}
      menuSheet={menu.sheet}
    />
  );
}
