/**
 * What the hub's entry row shows in each phase (3k-1): the first day and its pack list before the
 * trip, my flight on a travel day, and during the trip today's leave-by or, failing that, the
 * next stop, labelled with its day when it is not today's.
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

export function hubNext(input: {
  readonly header: HubHeader;
  readonly tripId: string;
  readonly startDate: string | null;
  readonly leaveBy: HubRows['leaveBy'];
  readonly nextItem: HubRows['next'];
  /** Today on the trip's clock. */
  readonly today: string;
  readonly tz: string;
  readonly locale: string;
}): HubNext | null {
  const { header, tripId, tz, locale } = input;
  if (header.phase === 'travel') {
    const { flight } = header;
    return {
      icon: 'plane',
      label: entryLabel(
        t({ id: 'trip.hub.flight', message: 'Your flight' }),
        clockIn(flight.departsAt, tz, locale),
      ),
      title: flight.title,
      detail: flight.arrivesAt === null ? null : landsAt(clockIn(flight.arrivesAt, tz, locale)),
      tone: 'raised',
      onPress: () => router.push('/(tabs)/wallet/bookings'),
    };
  }
  if (header.phase === 'pre' && input.startDate !== null) {
    const firstDay = input.startDate;
    return {
      icon: 'cal',
      label: entryLabel(
        t({ id: 'trip.hub.firstDay', message: 'First day' }),
        shortDay(locale, firstDay),
      ),
      title: t({ id: 'trip.hub.packTitle', message: 'Pack list' }),
      detail: t({ id: 'trip.hub.openDay', message: "Who's up, and what to pack" }),
      tone: 'raised',
      onPress: () => router.push(tripDayRoute(tripId, firstDay)),
    };
  }
  if (header.phase !== 'in') return null;
  if (input.leaveBy !== null) {
    return {
      icon: 'bell',
      label: leaveByLabel(input.leaveBy, locale),
      title: input.leaveBy.place_name ?? t({ id: 'trip.hub.earlyStart', message: 'Early start' }),
      detail: t({ id: 'trip.hub.openDay', message: "Who's up, and what to pack" }),
      tone: 'pink',
      onPress: () => router.push(tripDayRoute(tripId, null)),
    };
  }
  const item = input.nextItem;
  if (item === null) return null;
  return {
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
    onPress: () => router.push(tripDayRoute(tripId, item.day_date)),
  };
}
