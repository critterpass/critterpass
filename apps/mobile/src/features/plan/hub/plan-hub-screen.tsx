/**
 * The `/{tripId}/plan` route's screen. `plan.hub` decides: the trip map (7a-1), or the day plan (7b-1) on today during the
 * trip, else the first day with stops; a trip with nothing planned opens the map, where the empty
 * trip's ways to start are (7i-1). An organiser's unsent draft shows to them alone.
 */
import { Redirect } from 'expo-router';

import { useTripPlan } from '@/data/plan/use-trip-plan';
import { usePlanHub } from '@/lib/navigation/plan-hub-setting';

import { todayIn } from '../overview/data/use-plan-data';
import { TripMapScreen } from '../trip-map/trip-map-screen';
import { hubDay, planEntry } from './plan-hub';
import { tripPlanRoutes } from './routes';

function DayHub({ tripId }: { readonly tripId: string }) {
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  if (!plan.loaded || !plan.uidLoaded) return null;
  const today = plan.trip?.phase === 'in' ? todayIn(plan.trip.tz) : null;
  const dayNo = hubDay(
    plan.state.days.map((day) => ({
      dayNo: day.day_no,
      date: day.date,
      stops: plan.state.items.filter((item) => item.day_no === day.day_no).length,
    })),
    today,
  );
  if (dayNo === null || plan.state.items.length === 0) return <TripMapScreen tripId={tripId} />;
  return <Redirect href={tripPlanRoutes.day(tripId, dayNo)} />;
}

export function PlanHubScreen({ tripId }: { readonly tripId: string }) {
  const entry = planEntry(usePlanHub());
  if (entry === 'map') return <TripMapScreen tripId={tripId} />;
  return <DayHub tripId={tripId} />;
}
