/**
 * The pieces the hub's screen puts together from its rows: how a row or tile opens its page, the
 * open disruptions as rows, the built-in tiles, and what a called-off trip keeps (its chat).
 */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';

import { useGuideText } from '@/lib/i18n/guide-text';
import { openInTabs } from '@/lib/navigation/open-in-tabs';

import { parseSavedDay } from '../bundle/bundle-manager';
import { useLiveRows } from './data/live-rows';
import {
  disruptionHref,
  disruptionIcon,
  disruptionLabel,
  OPEN_DISRUPTIONS_SQL,
  OPEN_DISRUPTIONS_TABLES,
  type OpenDisruptionRow,
} from './hub-disruptions';
import { tileTitles } from './hub-copy';
import { chatHref, walletHref } from './hub-links';
import type { HubNext } from './next-row';
import type { HubTileData } from './tiles';

/** Today's saved day has every file it names (the BOOKINGS tile says "all offline"). */
export function todayComplete(data: string): boolean {
  const day = parseSavedDay(data);
  return (
    day !== null &&
    day.missing.length === 0 &&
    day.assets.some((asset) => asset.kind === 'attachment')
  );
}

/** Opens `href` as a page over the hub. */
export function go(href: Href | undefined): (() => void) | undefined {
  return href === undefined ? undefined : () => router.push(href);
}

/** Opens a page of another tab (Home, the wallet) in that tab, never as a copy pushed onto this one. */
export function goTab(href: Href | undefined): (() => void) | undefined {
  return href === undefined ? undefined : () => openInTabs(href);
}

/** The trip's open disruptions, newest first, each a row that opens its own screen. */
export function useDisruptionRows(tripId: string, shown: boolean): readonly HubNext[] {
  const words = useGuideText();
  const { rows } = useLiveRows<OpenDisruptionRow>(
    OPEN_DISRUPTIONS_SQL,
    shown ? [tripId] : null,
    OPEN_DISRUPTIONS_TABLES,
  );
  return useMemo(
    () =>
      rows.map((row) => {
        const href = disruptionHref(row, tripId);
        return {
          icon: disruptionIcon(row.kind),
          label: disruptionLabel(row.kind),
          title: words('disruption', row, 'title') ?? row.title,
          detail: null,
          tone: 'pink' as const,
          testID: `trip-hub-disruption-${row.id}`,
          onPress: () => router.push(href),
        };
      }),
    [rows, tripId, words],
  );
}

/** A called-off trip's chat stays to read: the one row its hub keeps above the tiles. */
export function chatEntry(crewId: string): HubNext {
  const href = chatHref(crewId);
  return {
    icon: 'chat',
    label: null,
    title: t({ id: 'trip.hub.chat', message: 'Crew chat' }),
    detail: t({ id: 'trip.hub.chatDetail', message: 'Everything said stays to read' }),
    tone: 'raised',
    testID: 'trip-hub-chat',
    onPress: () => router.push(href),
  };
}

interface TileFacts {
  readonly value: string;
  readonly caption: string | null;
}

/** PLAN (left out with `plan` null), BOOKINGS and MONEY; the wallet's two open on this trip. */
export function builtInTiles(input: {
  readonly tripId: string;
  readonly plan: (TileFacts & { readonly href: Href | undefined }) | null;
  readonly bookings: TileFacts;
  readonly money: TileFacts;
}): HubTileData[] {
  const titles = tileTitles();
  const { plan } = input;
  const openPlan = go(plan?.href);
  const openBookings = goTab(walletHref(input.tripId, 'bookings'));
  const openMoney = goTab(walletHref(input.tripId, 'money'));
  return [
    ...(plan === null
      ? []
      : [
          {
            key: 'plan',
            title: titles.plan,
            value: plan.value,
            caption: plan.caption,
            icon: 'cal' as const,
            tone: 'pink' as const,
            ...(openPlan === undefined ? {} : { onPress: openPlan }),
          },
        ]),
    {
      key: 'bookings',
      title: titles.bookings,
      ...input.bookings,
      icon: 'ticket' as const,
      tone: 'blue' as const,
      ...(openBookings === undefined ? {} : { onPress: openBookings }),
    },
    {
      key: 'money',
      title: titles.money,
      ...input.money,
      icon: 'wallet' as const,
      tone: 'green' as const,
      ...(openMoney === undefined ? {} : { onPress: openMoney }),
    },
  ];
}
