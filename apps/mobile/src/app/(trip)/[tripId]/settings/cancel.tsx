/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { CancelTripScreen } from '@/features/plan/premium/settings/cancel-trip-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The current look keeps the trip's settings in its hub. */
function CurrentRoute() {
  return <Redirect href={{ pathname: '/hub/[tripId]', params: { tripId: useTripId() } }} />;
}

/** Cancel the trip, its consequences and the hold (4.55). */
function PremiumRoute() {
  return <CancelTripScreen tripId={useTripId()} />;
}

export default premiumRoute({ premium: PremiumRoute, legacy: CurrentRoute });
