import { useLocalSearchParams } from 'expo-router';

import { SearchSheet } from '@/features/vote/places/search-sheet';

export default function PlaceSearchRoute() {
  const { crewId } = useLocalSearchParams<{ crewId?: string }>();
  return <SearchSheet crewId={crewId} />;
}
