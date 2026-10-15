/**
 * Before you go: the state both UIs share. Pausing and cancelling both happen in the store's own sheet; what the
 * person did there comes back through the server's subscription row. The App Store has no pause,
 * so there the person turns renewal off and the app tells the server when they mean to come back
 * (a month before the trip), which is what the reminder a week ahead of that date goes by.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and Intl options, never copy. */
import { format } from '@cp/i18n';
import { useCallback, useMemo, useState } from 'react';

import { storePlatform } from '@/data/billing';
import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLiveRows } from '@/data/plan/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';

import { perkLines } from '../perks/perk-copy';
import { MONETIZE_ROUTES } from '../routes';
import type { CancelViewProps, PauseMonth } from './cancel-props';
import { pauseResumeDate } from './plan-model';
import { useRecheckOnReturn } from './use-billing-issue';
import { usePlan } from './use-plan';

const NEXT_TRIP_SQL = `SELECT t.start_date, d.name AS destination FROM trips t
  LEFT JOIN destinations d ON d.id = t.destination_id
  WHERE t.start_date > ? AND t.status NOT IN ('post_trip', 'archived', 'cancelled')
  ORDER BY t.start_date LIMIT 1`;
const NEXT_TRIP_TABLES = ['trips', 'destinations'];
const NARROW: Intl.DateTimeFormatOptions = { month: 'narrow', timeZone: 'UTC' };
const LONG: Intl.DateTimeFormatOptions = { month: 'long', timeZone: 'UTC' };

const MAX_MONTHS = 6;

export const setPauseIntentCommand = defineClientCommand<{ readonly resume_at: string }>({
  name: 'set_pause_intent',
  offline: false,
});

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

/** Null while the plan rows have not been read. */
export function useCancelScreen(): CancelViewProps | null {
  const locale = useLocale();
  const { rows, plan, recheck, manage } = usePlan();
  const { send } = useCommand(setPauseIntentCommand);
  const [now] = useState(() => new Date());
  const today = now.toISOString().slice(0, 10);
  const next = useLiveRows<{ start_date: string | null; destination: string | null }>(
    NEXT_TRIP_SQL,
    [today],
    NEXT_TRIP_TABLES,
  );
  const perks = useMemo(() => perkLines(rows.perks, 'pass_plus'), [rows.perks]);
  const back = useCallback(() => goBackOr(MONETIZE_ROUTES.plan), []);
  // The store's page did the cancelling or pausing: back in the app, the subscription is checked
  // again and Your plan (which says "ends on {date}") is where the person lands.
  const [atStore, setAtStore] = useState(false);
  const returned = useCallback(() => {
    if (atStore) back();
  }, [atStore, back]);
  useRecheckOnReturn(recheck, returned);
  const openStore = () => {
    setAtStore(true);
    manage();
  };
  if (plan === null) return null;
  const trip = next.rows[0];
  const start = trip?.start_date ? new Date(`${trip.start_date.slice(0, 10)}T00:00:00Z`) : null;
  const months = start === null ? [] : pauseMonths(now, start, locale);
  const pause = () => {
    const resume = start === null || months.length === 0 ? null : pauseResumeDate(start, now);
    if (storePlatform() === 'app_store' && plan.canPause && resume !== null) {
      // The reminder is a courtesy: the store sheet opens whether or not this reaches the server.
      void send({ resume_at: resume.toISOString() }).catch(() => undefined);
    }
    openStore();
  };
  return {
    plan,
    store: storePlatform(),
    nextTrip:
      trip === undefined || start === null || !trip.destination
        ? null
        : { name: trip.destination, months },
    perks,
    onPause: pause,
    onKeep: back,
    onCancel: openStore,
    onBack: back,
  };
}
