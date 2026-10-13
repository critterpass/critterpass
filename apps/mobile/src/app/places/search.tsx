import { useLocalSearchParams } from 'expo-router';

import { SearchPlaces } from '@/features/vote/premium/places/search-places';

/** Search places (3b-7; 4.02). */
export default function PlaceSearchRoute() {
  const { crewId } = useLocalSearchParams<{ crewId?: string }>();
  return <SearchPlaces crewId={crewId} />;
}
