/**
 * Before you go (4d-2). Pausing and cancelling both happen in the store's own sheet; what the
 * person did there comes back through the server's subscription row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { format } from '@cp/i18n';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { storePlatform } from '@/data/billing';
import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import type { PauseMonth } from '@/ui/monetize/PauseBars';

import { perkLines } from '../perks/perk-copy';
import { MONETIZE_ROUTES } from '../routes';
import { CancelView } from './cancel-view';
import { usePlan } from './use-plan';

const NEXT_TRIP_SQL = `SELECT t.start_date, d.name AS destination FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.start_date > ? AND t.status NOT IN ('post_trip', 'archived', 'cancelled')
  ORDER BY t.start_date LIMIT 1`;
const NEXT_TRIP_TABLES = ['trips', 'destinations'];
const NARROW: Intl.DateTimeFormatOptions = { month: 'narrow', timeZone: 'UTC' };
const LONG: Intl.DateTimeFormatOptions = { month: 'long', timeZone: 'UTC' };

const MAX_MONTHS = 6;

/** The months from now to the trip's month: every one before the trip is paused. */
export function pauseMonths(now: Date, tripStart: Date, locale: string): PauseMonth[] {
  const span =
    (tripStart.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (tripStart.getUTCMonth() - now.getUTCMonth());
  if (span < 1 || span >= MAX_MONTHS) return [];
  return Array.from({ length: span + 1 }, (_unused, index) => {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index, 1));
    return {
      label: format.date(locale, month, NARROW),
      name: format.date(locale, month, LONG),
      paused: index < span,
      ...(index === span ? { trip: true } : {}),
    };
  });
}

export function CancelScreen() {
  const locale = useLocale();
  const { rows, plan, manage } = usePlan();
  const [now] = useState(() => new Date());
  const today = now.toISOString().slice(0, 10);
  const next = useLiveRows<{ start_date: string | null; destination: string | null }>(
    NEXT_TRIP_SQL,
    [today],
    NEXT_TRIP_TABLES,
  );
  const perks = useMemo(() => perkLines(rows.perks, 'pass_plus'), [rows.perks]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(MONETIZE_ROUTES.plan));
  if (plan === null) return null;
  const trip = next.rows[0];
  const start = trip?.start_date ? new Date(`${trip.start_date.slice(0, 10)}T00:00:00Z`) : null;
  return (
    <CancelView
      plan={plan}
      store={storePlatform()}
      nextTrip={
        trip === undefined || start === null || !trip.destination
          ? null
          : { name: trip.destination, months: pauseMonths(now, start, locale) }
      }
      perks={perks}
      onPause={manage}
      onKeep={back}
      onCancel={manage}
      onBack={back}
    />
  );
}
