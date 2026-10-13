import { Redirect, useLocalSearchParams } from 'expo-router';

import { DayMapScreen } from '@/features/plan/day-plan/day-map-screen';
import { tripPlanRoutes } from '@/features/plan/hub/routes';
import { premiumRoute } from '@/lib/premium-ui';

function useDayParams() {
  const { tripId, day } = useLocalSearchParams<{ tripId: string; day: string }>();
  return { tripId, dayNo: Number(day) };
}

/** One day's map, open full screen (7b-2): `/{tripId}/day/{n}/map`. */
function CurrentDayMapRoute() {
  const { tripId, dayNo } = useDayParams();
  return <DayMapScreen tripId={tripId} dayNo={dayNo} />;
}

/** The premium plan is one map: a day's map is that map on the day, the sheet at peek (4.25). */
function PremiumDayMapRoute() {
  const { tripId, dayNo } = useDayParams();
  return <Redirect href={tripPlanRoutes.map(tripId, { day: dayNo, sheet: 'peek' })} />;
}

export default premiumRoute({ premium: PremiumDayMapRoute, legacy: CurrentDayMapRoute });
