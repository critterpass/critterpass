import { TripsPremiumScreen } from '@/features/home/premium/trips/trips-premium-screen';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';
import { TripHubScreen } from '@/features/trip/hub/screen';
import { TripListScreen } from '@/features/trip/trip-list/screen';
import { premiumRoute } from '@/lib/premium-ui';

/** The TRIPS tab (3k-1): the one trip's hub, or the switcher when there are several. */
function LegacyTrips() {
  return (
    <LocalFirstGate>
      <TripListScreen hub={(tripId) => <TripHubScreen tripId={tripId} onSwitch={null} />} />
    </LocalFirstGate>
  );
}

/** Premium (3.05, 3.06): always the list, or the empty passport. */
function PremiumTrips() {
  return (
    <LocalFirstGate>
      <TripsPremiumScreen />
    </LocalFirstGate>
  );
}

export default premiumRoute({ premium: PremiumTrips, legacy: LegacyTrips });
