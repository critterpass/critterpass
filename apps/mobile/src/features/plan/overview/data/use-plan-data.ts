/**
 * `usePlanData(tripId)`: the trip's plan as the review reads it, from the one plan reader
 * (`useTripPlan` in `@/data/plan`, which picks the crew's current version or an organiser's private
 * draft before it is proposed), with its days and labelled items. Pure reads; the trip route
 * layout holds the streams that fill them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, states and wire values, never copy. */
import { useMemo } from 'react';

import { useActiveLocale } from '@/lib/i18n/use-locale';

import { toPlanDays, toPlanItems, type PlanDay, type PlanItem } from '../model/plan-model';
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
    members: plan.crew,
  };
}
