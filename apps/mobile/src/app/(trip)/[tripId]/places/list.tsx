import { router, useLocalSearchParams } from 'expo-router';

import { LocalFirstGate } from '@/features/explore';
import { tripExploreLinks } from '@/features/explore/trip-explore/links';
import { goBackOr } from '@/lib/navigation/back';
import {
  carryParams,
  parseFilter,
  PlacesListScreen,
  placesRoutes,
  resultsFrom,
} from '@/features/explore/places';

/** The trip's places as rows (7c-3), grouped by where they stand and sorted by fit. */
export default function TripPlacesListRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    filter?: string;
    results?: string;
    chips?: string;
  }>();
  const filter = parseFilter(params.filter);
  return (
    <LocalFirstGate>
      <PlacesListScreen
        tripId={params.tripId}
        filter={filter}
        onFilter={(next) => router.setParams({ filter: next === 'all' ? '' : next })}
        results={resultsFrom(params)}
        onLeaveResults={() => router.setParams({ results: '', chips: '' })}
        onMap={() => router.replace(placesRoutes.map(params.tripId, carryParams(filter, params)))}
        onBack={() => goBackOr(tripExploreLinks.hub(params.tripId))}
      />
    </LocalFirstGate>
  );
}
