import { TripsPremiumScreen } from '@/features/home/premium/trips/trips-premium-screen';
import { LocalFirstGate } from '@/features/trip/hub/local-first-gate';

/** The TRIPS tab (3.05, 3.06): always the list, or the empty passport. */
export default function TripsRoute() {
  return (
    <LocalFirstGate>
      <TripsPremiumScreen />
    </LocalFirstGate>
  );
}
