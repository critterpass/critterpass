/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { premiumRoute } from '@/lib/premium-ui';
import { TRIPS_TAB } from '@/features/trip/hub/routes';
import { TripHubScreen } from '@/features/trip/hub/screen';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';

/** One trip's hub (3k-1), opened from the trip switcher, a link or Home's trip card. */
function TripHubRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  if (typeof tripId !== 'string') return null;
  return (
    <LocalFirstGate>
      <TripHubScreen tripId={tripId} onSwitch={() => goBackOr(TRIPS_TAB)} />
    </LocalFirstGate>
  );
}

/** The premium UI shows the hub on the root stack (`/hub/<tripId>`), above the tab bar. */
function TripHubOnRootStack() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Redirect href={typeof tripId === 'string' ? `/hub/${tripId}` : TRIPS_TAB} />;
}

export default premiumRoute({ premium: TripHubOnRootStack, legacy: TripHubRoute });
