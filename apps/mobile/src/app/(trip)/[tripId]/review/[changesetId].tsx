import { useLocalSearchParams } from 'expo-router';

import { ChangesReviewScreen } from '@/features/plan';

/** Review changes (7h-7): `/{tripId}/review/{changesetId}`. */
export default function ReviewRoute() {
  const { tripId, changesetId } = useLocalSearchParams<{ tripId: string; changesetId: string }>();
  return <ChangesReviewScreen tripId={tripId ?? ''} changesetId={changesetId ?? ''} />;
}
