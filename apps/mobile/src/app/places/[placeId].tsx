import { useLocalSearchParams } from 'expo-router';

import { GuestGuidePage } from '@/features/vote/places/guest-guide-page';

export default function PlaceRoute() {
  const { placeId, crewId } = useLocalSearchParams<{ placeId: string; crewId?: string }>();
  return <GuestGuidePage placeId={placeId} crewId={crewId} />;
}
