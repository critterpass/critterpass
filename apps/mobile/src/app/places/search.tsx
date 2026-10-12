import { useLocalSearchParams } from 'expo-router';

import { SearchPlaces } from '@/features/vote/premium/places/search-places';
import { SearchSheet } from '@/features/vote/places/search-sheet';
import { usePremiumUi } from '@/lib/premium-ui';

/** Search places (3b-7; 4.02 in the premium look). */
export default function PlaceSearchRoute() {
  const { crewId } = useLocalSearchParams<{ crewId?: string }>();
  const Screen = usePremiumUi() ? SearchPlaces : SearchSheet;
  return <Screen crewId={crewId} />;
}
