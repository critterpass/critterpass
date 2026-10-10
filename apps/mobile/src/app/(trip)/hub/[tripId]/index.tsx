/* eslint-disable lingui/no-unlocalized-strings -- route paths, not copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { TripAccessGate } from '@/features/trip/access/trip-access-gate';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';
import { TRIPS_TAB } from '@/features/trip/hub/routes';
import { TripHubScreen } from '@/features/trip/hub/screen';
import { goBackOr } from '@/lib/navigation/back';
import { premiumRoute } from '@/lib/premium-ui';

function useTripId(): string | null {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return typeof tripId === 'string' ? tripId : null;
}

/** The premium UI opens a trip's hub here, on the root stack above the tabs, so the tab bar leaves. */
function TripHubOverTabs() {
  const tripId = useTripId();
  if (tripId === null) return null;
  return (
    <TripAccessGate tripId={tripId}>
      <LocalFirstGate>
        <TripHubScreen tripId={tripId} onSwitch={() => goBackOr(TRIPS_TAB)} />
      </LocalFirstGate>
    </TripAccessGate>
  );
}

/** The current UI keeps the hub inside the Trips tab. */
function TripHubInTab() {
  const tripId = useTripId();
  return <Redirect href={tripId === null ? TRIPS_TAB : `/trips/${tripId}`} />;
}

/** One trip's hub over the tabs (3k-1, 6.01). */
export default premiumRoute({ premium: TripHubOverTabs, legacy: TripHubInTab });
