import { router, useLocalSearchParams } from 'expo-router';

import { LocalFirstGate } from '@/features/explore';
import { tripExploreLinks } from '@/features/explore/trip-explore/links';
import { goBackOr } from '@/lib/navigation/back';
import {
  carryParams,
  parseFilter,
  PlacesMapScreen,
  placesRoutes,
  resultsFrom,
} from '@/features/explore/places';

/** The trip's places map (7c-1) and a picked place (7c-2). */
export default function TripPlacesMapRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    filter?: string;
    placeId?: string;
    results?: string;
    chips?: string;
  }>();
  const filter = parseFilter(params.filter);
  return (
    <LocalFirstGate>
      <PlacesMapScreen
        tripId={params.tripId}
        placeId={params.placeId}
        filter={filter}
        onFilter={(next) => router.setParams({ filter: next === 'all' ? '' : next })}
        results={resultsFrom(params)}
        onLeaveResults={() => router.setParams({ results: '', chips: '' })}
        onList={() => router.replace(placesRoutes.list(params.tripId, carryParams(filter, params)))}
        onBack={() => goBackOr(tripExploreLinks.hub(params.tripId))}
      />
    </LocalFirstGate>
  );
}
