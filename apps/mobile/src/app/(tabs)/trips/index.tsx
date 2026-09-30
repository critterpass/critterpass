import { TripHubScreen } from '@/features/trip/hub/screen';
import { TripListScreen } from '@/features/trip/trip-list/screen';

/** The TRIPS tab (3k-1): the one trip's hub, or the switcher when there are several. */
export default function TripsRoute() {
  return <TripListScreen hub={(tripId) => <TripHubScreen tripId={tripId} onSwitch={null} />} />;
}
