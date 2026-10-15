import { Redirect, useLocalSearchParams } from 'expo-router';

import { tripPlanRoutes } from '@/features/plan/hub/routes';

function useDayParams() {
  const { tripId, day } = useLocalSearchParams<{ tripId: string; day: string }>();
  return { tripId, dayNo: Number(day) };
}

/** The plan is one map: a day's map is that map on the day, the sheet at peek (4.25). */
export default function DayMapRoute() {
  const { tripId, dayNo } = useDayParams();
  return <Redirect href={tripPlanRoutes.map(tripId, { day: dayNo, sheet: 'peek' })} />;
}
