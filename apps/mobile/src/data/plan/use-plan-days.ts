/**
 * A trip has its days as soon as its dates are locked, before anyone drafts anything: an
 * organiser-only plan with a day per date and no stops, which the plan screens show and she fills
 * by hand or has the guide draft. The server writes it when the dates lock; a trip whose dates were
 * locked before that gets it here, the first time an organiser opens its plan. Asked once per trip
 * (the server leaves a trip that has a plan as it is).
 */
import { useEffect } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { ensurePlanDaysCommand } from './commands';
import type { TripPlan } from './use-trip-plan';

const asked = new Set<string>();

/** The trip has locked dates and no plan of any kind, and this is its organiser. */
export function needsPlanDays(plan: Pick<TripPlan, 'loaded' | 'organiser' | 'trip'>): boolean {
  const trip = plan.trip;
  return (
    plan.loaded &&
    plan.organiser &&
    trip !== null &&
    trip.phase === 'planning' &&
    trip.start_date !== null &&
    trip.end_date !== null &&
    trip.current_version_id === null &&
    trip.draft_version_id === null
  );
}

export function useEnsurePlanDays(plan: TripPlan): void {
  const ensure = useCommand(ensurePlanDaysCommand);
  const tripId = plan.trip?.id ?? null;
  const needed = needsPlanDays(plan);
  useEffect(() => {
    if (!needed || tripId === null || asked.has(tripId)) return;
    asked.add(tripId);
    void ensure.send({ trip_id: tripId });
  }, [needed, tripId, ensure]);
}
