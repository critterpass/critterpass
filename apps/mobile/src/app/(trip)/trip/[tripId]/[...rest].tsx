import { Redirect, useLocalSearchParams } from 'expo-router';

import { tripLinkTarget } from '@/features/plan/overview/routes';

/**
 * Pushes and inbox items link trip screens as `/trip/{id}/...` (the plan, a change review, a day,
 * a decision); the screens live at `/{id}/...`. Forwards with the rest of the path and the query.
 * The more specific forwarders beside this one (draft, setup) win over it.
 */
export default function TripLinkForward() {
  const { tripId, rest, ...query } = useLocalSearchParams<{ tripId: string; rest: string[] }>();
  return <Redirect href={tripLinkTarget(tripId, rest, query)} />;
}
