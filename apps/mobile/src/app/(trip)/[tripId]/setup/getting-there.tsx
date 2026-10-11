/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { GettingThereScreen } from '@/features/setup/premium/getting-there/getting-there-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return tripId;
}

/** The current look has no page of its own for this: setup opens at its step. */
function CurrentGettingThereRoute() {
  return <Redirect href={{ pathname: '/[tripId]/setup', params: { tripId: useTripId() } }} />;
}

/** How everyone gets there (4.18). */
function PremiumGettingThereRoute() {
  return <GettingThereScreen tripId={useTripId()} />;
}

export default premiumRoute({
  premium: PremiumGettingThereRoute,
  legacy: CurrentGettingThereRoute,
});
