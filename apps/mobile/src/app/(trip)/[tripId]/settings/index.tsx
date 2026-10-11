/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { TripSettingsScreen } from '@/features/plan/premium/settings/trip-settings-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The current look keeps the trip's settings in its hub. */
function CurrentRoute() {
  return <Redirect href={{ pathname: '/hub/[tripId]', params: { tripId: useTripId() } }} />;
}

/** Trip settings (4.53), from the plan's more menu. */
function PremiumRoute() {
  return <TripSettingsScreen tripId={useTripId()} />;
}

export default premiumRoute({ premium: PremiumRoute, legacy: CurrentRoute });
