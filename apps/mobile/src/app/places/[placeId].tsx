import { useLocalSearchParams } from 'expo-router';

import { GuestGuide } from '@/features/vote/premium/places/guest-guide';

/** A place no live guide covers (3b-8; 4.03). */
export default function PlaceRoute() {
  const { placeId, crewId } = useLocalSearchParams<{ placeId: string; crewId?: string }>();
  return <GuestGuide placeId={placeId} crewId={crewId} />;
}
