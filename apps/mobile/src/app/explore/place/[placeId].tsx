import { useLocalSearchParams } from 'expo-router';

import { PlaceScreen } from '@/features/explore';
import { PremiumPlaceScreen } from '@/features/explore/premium/place/place-screen';
import { usePremiumUi } from '@/lib/premium-ui';

/** A place's page (7e-1; 4.36 in the premium look). */
export default function ExplorePlaceRoute() {
  const { placeId, destinationId, tripId } = useLocalSearchParams<{
    placeId: string;
    destinationId?: string;
    tripId?: string;
  }>();
  const Screen = usePremiumUi() ? PremiumPlaceScreen : PlaceScreen;
  return <Screen placeId={placeId} destinationId={destinationId} tripId={tripId} />;
}
