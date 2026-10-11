/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { DayTripsScreen } from '@/features/explore/premium/day-trips/day-trips-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The current look lists day trips on the trip's Explore. */
function CurrentDayTripsRoute() {
  return <Redirect href={{ pathname: '/[tripId]/explore', params: { tripId: useTripId() } }} />;
}

/** Day trips from the stop (4.49). */
function PremiumDayTripsRoute() {
  return <DayTripsScreen tripId={useTripId()} />;
}

export default premiumRoute({ premium: PremiumDayTripsRoute, legacy: CurrentDayTripsRoute });
