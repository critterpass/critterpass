import { useLocalSearchParams } from 'expo-router';

import { ReviewScreen } from '@/features/plan';

/** Review changes (3e-3): `/{tripId}/review/{changesetId}`. */
export default function ReviewRoute() {
  const { tripId, changesetId } = useLocalSearchParams<{ tripId: string; changesetId: string }>();
  return <ReviewScreen tripId={tripId ?? ''} changesetId={changesetId ?? ''} />;
}
