/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { TRIPS_TAB } from '@/features/trip/hub/routes';

/** The premium UI shows the hub on the root stack (`/hub/<tripId>`), above the tab bar. */
function TripHubOnRootStack() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <Redirect href={typeof tripId === 'string' ? `/hub/${tripId}` : TRIPS_TAB} />;
}

export default TripHubOnRootStack;
