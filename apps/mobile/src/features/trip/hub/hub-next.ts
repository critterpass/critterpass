/**
 * What the hub's entry rows show in each phase (3k-1): the first day and its pack list before the
 * trip, my flight on a travel day, and during the trip today's leave-by or next stop. Once nothing
 * of today is ahead, a row still opens today's page, and the next stop on another day follows it,
 * labelled with its day and opening that day.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and icon names, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';

import { clockIn } from '../leave-by/model';
import type { HubRows } from './data/use-hub';
import { entryLabel, landsAt, leaveByLabel, nextUpLabel, shortDay } from './hub-copy';
import type { HubHeader } from './hub-model';
import type { HubNext } from './next-row';
import { tripDayRoute } from './routes';

export function hubEntries(input: {
  readonly header: HubHeader;
  readonly tripId: string;
  readonly startDate: string | null;
  readonly leaveBy: HubRows['leaveBy'];
  readonly nextItem: HubRows['next'];
  /** Today on the trip's clock. */
  readonly today: string;
  readonly tz: string;
  readonly locale: string;
}): HubNext[] {
  const { header, tripId, tz, locale } = input;
  if (header.phase === 'travel') {
    const { flight } = header;
    return [
      {
        icon: 'plane',
        label: entryLabel(
          t({ id: 'trip.hub.flight', message: 'Your flight' }),
          clockIn(flight.departsAt, tz, locale),
        ),
        title: flight.title,
        detail: flight.arrivesAt === null ? null : landsAt(clockIn(flight.arrivesAt, tz, locale)),
        tone: 'raised',
        testID: 'trip-hub-next',
        onPress: () => router.push('/(tabs)/wallet/bookings'),
      },
    ];
  }
  const dayPage = t({ id: 'trip.hub.openDay', message: "Who's up, and what to pack" });
  if (header.phase === 'pre' && input.startDate !== null) {
    const firstDay = input.startDate;
    return [
      {
        icon: 'cal',
        label: entryLabel(
          t({ id: 'trip.hub.firstDay', message: 'First day' }),
          shortDay(locale, firstDay),
        ),
        title: t({ id: 'trip.hub.packTitle', message: 'Pack list' }),
        detail: dayPage,
        tone: 'raised',
        testID: 'trip-hub-next',
        onPress: () => router.push(tripDayRoute(tripId, firstDay)),
      },
    ];
  }
  if (header.phase !== 'in') return [];
  if (input.leaveBy !== null) {
    return [
      {
        icon: 'bell',
        label: leaveByLabel(input.leaveBy, locale),
        title: input.leaveBy.place_name ?? t({ id: 'trip.hub.earlyStart', message: 'Early start' }),
        detail: dayPage,
        tone: 'pink',
        testID: 'trip-hub-next',
        onPress: () => router.push(tripDayRoute(tripId, null)),
      },
    ];
  }
  const item = input.nextItem;
  const stop: HubNext | null =
    item === null
      ? null
      : {
          icon: 'pin',
          label: nextUpLabel(
            locale,
            input.today,
            item.day_date,
            clockIn(new Date(item.starts_at), item.tz ?? tz, locale),
          ),
          title: item.poi_name ?? item.notes ?? item.category ?? '',
          detail: null,
          tone: 'raised',
          testID: 'trip-hub-next',
          onPress: () => router.push(tripDayRoute(tripId, item.day_date)),
        };
  if (stop !== null && item !== null && item.day_date <= input.today) return [stop];
  // Nothing of today is ahead: today's page stays one tap away, before any later day's stop.
  const todayPage: HubNext = {
    icon: 'sun',
    label: entryLabel(t({ id: 'trip.hub.today', message: 'Today' }), shortDay(locale, input.today)),
    title: t({ id: 'trip.hub.todayDone', message: 'Nothing more today' }),
    detail: dayPage,
    tone: 'raised',
    testID: 'trip-hub-today',
    onPress: () => router.push(tripDayRoute(tripId, null)),
  };
  return stop === null ? [todayPage] : [todayPage, stop];
}
