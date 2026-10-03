/**
 * `usePlanData(tripId)`: the trip's plan as the overview reads it, from the one plan reader
 * (`useTripPlan` in `@/data/plan`, which picks the crew's current version or an organiser's private
 * draft before it is proposed), with its days and labelled items, open decisions, the forecast and
 * applied guide changes. Pure reads; the trip route layout holds the streams that fill them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, states and wire values, never copy. */
import { useMemo } from 'react';

import { useActiveLocale } from '@/lib/i18n/use-locale';

import {
  buildDayCards,
  toPlanDays,
  toPlanItems,
  type DayCard,
  type PlanDay,
  type PlanItem,
} from '../model/plan-model';
import { useLiveRows } from './live-rows';
import {
  GUIDE_CHANGES_SQL,
  GUIDE_CHANGES_TABLES,
  POLLS_SQL,
  POLLS_TABLES,
  WEATHER_SQL,
  WEATHER_TABLES,
  type GuideChangeRow,
  type OpenPollRow,
  type WeatherRow,
} from './plan-rows';
import { type MemberRow, type PlanTripRow } from '@/data/plan/queries';
import { useTripPlan } from '@/data/plan/use-trip-plan';

export type PlanMode = 'group' | 'draft';

export interface PlanData {
  readonly status: 'loading' | 'missing' | 'no_plan' | 'ready';
  readonly uid: string | null;
  readonly trip: PlanTripRow | null;
  /** The version shown: the crew's current one, or (organisers only) the unproposed draft. */
  readonly versionId: string | null;
  readonly mode: PlanMode;
  readonly organiser: boolean;
  /** Past trips, cancelled ones and members who dropped out read the plan without editing. */
  readonly readOnly: boolean;
  readonly days: readonly PlanDay[];
  readonly items: readonly PlanItem[];
  readonly polls: readonly OpenPollRow[];
  readonly weather: readonly WeatherRow[];
  readonly guideChanges: readonly GuideChangeRow[];
  readonly members: readonly MemberRow[];
}

/** Today's date in `tz` (`YYYY-MM-DD`). */
export function todayIn(tz: string | null, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(now);
}

export function usePlanData(tripId: string | null): PlanData {
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  const { trip, versionId } = plan;
  const polls = useLiveRows<OpenPollRow>(
    POLLS_SQL,
    tripId === null ? null : [tripId],
    POLLS_TABLES,
  );
  const weather = useLiveRows<WeatherRow>(
    WEATHER_SQL,
    trip?.destination_id ? [trip.destination_id] : null,
    WEATHER_TABLES,
  );
  const guideChanges = useLiveRows<GuideChangeRow>(
    GUIDE_CHANGES_SQL,
    tripId === null ? null : [tripId],
    GUIDE_CHANGES_TABLES,
  );

  const locale = useActiveLocale();
  const planDays = useMemo(() => toPlanDays(plan.dayRows, locale), [plan.dayRows, locale]);
  const planItems = useMemo(
    () => toPlanItems(plan.itemRows, locale, plan.places),
    [plan.itemRows, locale, plan.places],
  );
  const status: PlanData['status'] =
    !plan.uidLoaded || !plan.loaded
      ? 'loading'
      : trip === null
        ? 'missing'
        : versionId === null || planDays.length === 0
          ? 'no_plan'
          : 'ready';
  const readOnly =
    trip !== null &&
    (trip.phase === 'post' ||
      trip.phase === 'cancelled' ||
      trip.my_rsvp === 'out' ||
      trip.my_role === null);

  return {
    status,
    uid: plan.uid,
    trip,
    versionId,
    mode: plan.mode,
    organiser: plan.organiser,
    readOnly,
    days: planDays,
    items: planItems,
    polls: polls.rows,
    weather: weather.rows,
    guideChanges: guideChanges.rows,
    members: plan.crew,
  };
}

/** The overview's day cards, with past days known once the trip is under way. */
export function useDayCards(data: PlanData): DayCard[] {
  const inTrip = data.trip?.phase === 'in';
  const tz = data.trip?.tz ?? null;
  return useMemo(
    () =>
      buildDayCards({
        days: data.days,
        items: data.items,
        polls: data.polls,
        weather: data.weather,
        today: inTrip ? todayIn(tz) : null,
      }),
    [data.days, data.items, data.polls, data.weather, inTrip, tz],
  );
}
