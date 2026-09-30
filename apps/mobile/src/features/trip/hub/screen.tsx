/**
 * The trip hub (3k-1) over synced rows: the phase header and countdown (1 Hz), the next thing, the
 * guide's briefing with its chips, the PLAN / BOOKINGS / MONEY tiles plus registered ones, and the
 * crew's ticker. Offline, the header gives way to the offline card.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, route paths and tile keys, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { briefingState } from '../briefing/briefing-model';
import { BUNDLE_KIND, savedDayId, type SavedDay } from '../bundle/bundle-manager';
import { OfflineView } from '../offline/offline-view';
import { useOffline } from '../offline/use-offline';
import { useBriefingActions } from '../briefing/chip-actions';
import { clockIn } from '../leave-by/model';
import { useLiveRows, useOwnerUid } from './data/live-rows';
import { useHubRows } from './data/use-hub';
import { guideColour, guideName as nameOf, guideOr } from './guide';
import {
  activityLine,
  bookingsTile,
  landsAt,
  shortDay,
  moneyTile,
  planTile,
  tileTitles,
  wholeMoney,
} from './hub-copy';
import { activityHref, HOME, planningLink } from './hub-links';
import { hubHeader, viewerNet, type HubFlight } from './hub-model';
import { HubView, type HubNext } from './hub-view';
import { tripDayRoute } from './routes';
import { HubTile, useRegisteredHubTiles } from './tiles';

/** Today's saved day has every file it names (the BOOKINGS tile says "all offline"). */
function todayComplete(data: string): boolean {
  try {
    const day = JSON.parse(data) as SavedDay;
    return day.missing.length === 0 && day.assets.some((asset) => asset.kind === 'attachment');
  } catch {
    return false;
  }
}

/** A month before the trip the briefing starts coming every morning. */
const BRIEFING_LEAD_DAYS = 30;

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** Opens `href`; Home is another tab, switched to rather than pushed onto this tab's stack. */
function go(href: Href | undefined): (() => void) | undefined {
  if (href === undefined) return undefined;
  return href === HOME ? () => router.navigate(href) : () => router.push(href);
}

export interface TripHubScreenProps {
  readonly tripId: string;
  readonly onSwitch: (() => void) | null;
}

export function TripHubScreen({ tripId, onSwitch }: TripHubScreenProps) {
  const me = useOwnerUid();
  const locale = useLocale();
  const { t } = useLingui();
  const now = useNow(1000);
  const minute = Math.floor(now.getTime() / 60_000);
  const minuteIso = useMemo(() => new Date(minute * 60_000).toISOString(), [minute]);
  const tzGuess = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tripTz = useLiveRows<{ tz: string | null }>(
    'SELECT coalesce(t.tz, d.tz) AS tz FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?',
    [tripId],
    ['trips', 'destinations'],
  ).rows[0]?.tz;
  const tz = tripTz ?? tzGuess;
  const today = toLocalWallTime(new Date(minute * 60_000), tz).date;
  const rows = useHubRows(tripId, me, today, minuteIso);
  const offline = useOffline(tripId);
  const offlineCard = offline === null ? null : <OfflineView {...offline} />;
  const savedToday = useLiveRows<{ data: string }>(
    'SELECT data FROM local_private WHERE kind = ? AND id = ?',
    [BUNDLE_KIND, savedDayId(tripId, today)],
    ['local_private'],
  ).rows[0];
  const bookingsOffline = savedToday !== undefined && todayComplete(savedToday.data);
  const registered = useRegisteredHubTiles();
  const names = useMemo(
    () => new Map(rows.members.map((row) => [row.user_id, row.display_name ?? ''])),
    [rows.members],
  );
  const onAct = useBriefingActions(names);
  const trip = rows.trip;
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

  let next: HubNext | null = null;
  if (header.phase === 'travel') {
    next = {
      eyebrow: t({ id: 'trip.hub.flight', message: 'Your flight' }),
      time: clockIn(header.flight.departsAt, tz, locale),
      title: header.flight.title,
      detail:
        header.flight.arrivesAt === null
          ? null
          : landsAt(clockIn(header.flight.arrivesAt, tz, locale)),
      tone: 'raised',
      onPress: () => router.push('/(tabs)/wallet/bookings'),
    };
  } else if (header.phase === 'pre' && trip?.start_date != null) {
    const firstDay = trip.start_date;
    next = {
      eyebrow: t({ id: 'trip.hub.firstDay', message: 'First day' }),
      time: shortDay(locale, firstDay),
      title: t({ id: 'trip.hub.packTitle', message: 'Pack list' }),
      detail: t({ id: 'trip.hub.openDay', message: "Who's up, and what to pack" }),
      tone: 'raised',
      onPress: () => router.push(tripDayRoute(tripId, firstDay)),
    };
  } else if (header.phase === 'in' && rows.leaveBy !== null) {
    const place = rows.leaveBy.place_name;
    next = {
      eyebrow: t({ id: 'trip.hub.leaveByToday', message: 'Leave by' }),
      time: clockIn(new Date(rows.leaveBy.leave_at), rows.leaveBy.tz, locale),
      title: place ?? t({ id: 'trip.hub.earlyStart', message: 'Early start' }),
      detail: t({ id: 'trip.hub.openDay', message: "Who's up, and what to pack" }),
      tone: 'pink',
      onPress: () => router.push(tripDayRoute(tripId, null)),
    };
  } else if (header.phase === 'in' && rows.next !== null) {
    const item = rows.next;
    next = {
      eyebrow: t({ id: 'trip.hub.next', message: 'Next up' }),
      time: clockIn(new Date(item.starts_at), item.tz ?? tz, locale),
      title: item.poi_name ?? item.notes ?? item.category ?? '',
      detail: null,
      tone: 'raised',
      onPress: () => router.push(tripDayRoute(tripId, item.day_date)),
    };
  }

  const start = trip?.start_date ?? null;
  const daysToStart =
    start === null
      ? null
      : (Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  const inWindow =
    header.phase === 'in' ||
    header.phase === 'travel' ||
    (header.phase === 'pre' && daysToStart !== null && daysToStart <= BRIEFING_LEAD_DAYS);
  const briefing = briefingState({
    briefing: rows.briefing,
    items: rows.briefingItems,
    pending: rows.pendingActs,
    today,
    offline: offline !== null,
    inWindow,
  });

  const net = me === null ? null : viewerNet(rows.ledger, me, trip?.local_currency ?? null);
  const plan = planTile(rows.days, rows.openVotes.length);
  const saved = bookingsTile(rows.bookings, bookingsOffline);
  const money = moneyTile(
    net === null ? null : wholeMoney(locale, net.amountMinor, net.currency),
    net === null ? 0 : Math.sign(net.amountMinor),
  );
  const compact = registered.length === 0;
  const titles = tileTitles();
  const builtIn = [
    {
      key: 'plan',
      title: titles.plan,
      ...plan,
      icon: 'cal' as const,
      tone: 'pink' as const,
      href: hrefFor('3e-1', { tripId }),
    },
    {
      key: 'bookings',
      title: titles.bookings,
      ...saved,
      icon: 'ticket' as const,
      tone: 'blue' as const,
      href: '/(tabs)/wallet/bookings' as Href,
    },
    {
      key: 'money',
      title: titles.money,
      ...money,
      icon: 'wallet' as const,
      tone: 'green' as const,
      href: '/(tabs)/wallet/money' as Href,
    },
  ];
  const tiles = [
    ...builtIn.map(({ href, ...tile }) => {
      const onPress = go(href);
      return {
        key: tile.key,
        node: (
          <HubTile
            tile={{ ...tile, ...(onPress === undefined ? {} : { onPress }) }}
            compact={compact}
          />
        ),
      };
    }),
    ...(trip === null
      ? []
      : registered.map(({ key, Tile }) => ({
          key,
          node: <Tile tripId={tripId} crewId={trip.crew_id} compact={compact} />,
        }))),
  ];

  const planning = trip === null ? null : planningLink(tripId, trip.status, rows.openVotes[0]);
  const planningAction = planning === null ? undefined : go(planning.href);

  return (
    <HubView
      state={rows.loaded && trip !== null ? 'ready' : 'loading'}
      header={header}
      now={now}
      startDate={trip?.start_date ?? null}
      endDate={trip?.end_date ?? null}
      going={rows.going}
      // A trip still choosing its place asks the crew's question (Home's heading while voting).
      destination={
        trip?.destination_name ?? t({ id: 'trip.hub.whereNext', message: 'Where next?' })
      }
      colour={guideColour(guide)}
      guide={guide}
      guideName={name}
      guestGuide={trip?.is_guest_guide === 1}
      planning={
        planning === null || planningAction === undefined
          ? null
          : { label: planning.label, onPress: planningAction }
      }
      next={next}
      briefing={briefing}
      onAct={onAct}
      tiles={tiles}
      ticker={rows.activity.map((row) => {
        const open = go(activityHref(row, tripId));
        return {
          id: row.id,
          text: activityLine(row),
          ...(open === undefined ? {} : { onPress: open }),
        };
      })}
      onSwitch={onSwitch}
      {...(offlineCard === null ? {} : { offlineCard })}
    />
  );
}
