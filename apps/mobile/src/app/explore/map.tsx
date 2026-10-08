import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { PlacesListScreen, PlacesMapScreen, type PlacesFilter } from '@/features/explore/places';

/**
 * A destination's map with its places, filters and cards, and the list view of the same: the
 * places map (7c-1…7c-3).
 */
export default function ExploreMapRoute() {
  const { destination, tripId, placeId } = useLocalSearchParams<{
    destination?: string;
    tripId?: string;
    placeId?: string;
  }>();
  return <DestinationPlaces destination={destination ?? ''} tripId={tripId} placeId={placeId} />;
}

/** The places map for a destination, with its list in place and a field that works offline. */
function DestinationPlaces(props: {
  readonly destination: string;
  readonly tripId: string | undefined;
  readonly placeId: string | undefined;
}) {
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [filter, setFilter] = useState<PlacesFilter>('all');
  const [query, setQuery] = useState('');
  const shared = {
    tripId: props.tripId ?? null,
    destination: props.destination,
    filter,
    onFilter: setFilter,
    results: null,
    onLeaveResults: () => undefined,
    // Inside a trip the pill opens the trip's search; outside one it searches this phone.
    ...(props.tripId === undefined ? { query, onQuery: setQuery } : {}),
    onBack: () => goBackOr(),
  };
  return mode === 'map' ? (
    <PlacesMapScreen {...shared} placeId={props.placeId} onList={() => setMode('list')} />
  ) : (
    <PlacesListScreen {...shared} onMap={() => setMode('map')} />
  );
}
