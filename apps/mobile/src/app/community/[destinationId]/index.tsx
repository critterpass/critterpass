import { useLocalSearchParams } from 'expo-router';

import { CrewPlansScreen } from '@/features/community/browse/browse-screen';

/** Crew plans (3o-1) for a destination (id or slug), ranked for the crew of `tripId` when given. */
export default function CrewPlansRoute() {
  const { destinationId, tripId } = useLocalSearchParams<{
    destinationId: string;
    tripId?: string;
  }>();
  return typeof destinationId === 'string' && destinationId.length > 0 ? (
    <CrewPlansScreen
      destination={destinationId}
      tripId={typeof tripId === 'string' && tripId !== '' ? tripId : null}
    />
  ) : null;
}
