/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { ChangeDatesScreen } from '@/features/plan/premium/settings/change-dates-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The current look keeps the trip's settings in its hub. */
function CurrentRoute() {
  return <Redirect href={{ pathname: '/hub/[tripId]', params: { tripId: useTripId() } }} />;
}

/** Change dates with what it changes (4.54). */
function PremiumRoute() {
  return <ChangeDatesScreen tripId={useTripId()} />;
}

export default premiumRoute({ premium: PremiumRoute, legacy: CurrentRoute });
