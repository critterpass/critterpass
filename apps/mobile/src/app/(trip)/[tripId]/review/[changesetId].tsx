import { useLocalSearchParams } from 'expo-router';

import { ChangesReviewScreen } from '@/features/plan';
import { PremiumChangesView } from '@/features/plan/premium/check/changes-view';

/** Review changes (7h-7; 4.48): `/{tripId}/review/{changesetId}`. */
export default function ReviewRoute() {
  const { tripId, changesetId } = useLocalSearchParams<{ tripId: string; changesetId: string }>();
  return (
    <ChangesReviewScreen
      tripId={tripId ?? ''}
      changesetId={changesetId ?? ''}
      View={PremiumChangesView}
    />
  );
}
