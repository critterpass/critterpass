/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { RouteScreen } from '@/features/setup/premium/route/route-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The current look has no page of its own for this: setup opens at its step. */
function CurrentRouteRoute() {
  return <Redirect href={{ pathname: '/[tripId]/setup', params: { tripId: useTripId() } }} />;
}

/** The route: the trip's stops and their nights (4.19). */
function PremiumRouteRoute() {
  return <RouteScreen tripId={useTripId()} />;
}

export default premiumRoute({
  premium: PremiumRouteRoute,
  legacy: CurrentRouteRoute,
});
