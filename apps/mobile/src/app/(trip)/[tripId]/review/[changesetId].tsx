import { useLocalSearchParams } from 'expo-router';

import { ChangesReviewScreen } from '@/features/plan';
import { PremiumChangesView } from '@/features/plan/premium/check/changes-view';
import { usePremiumUi } from '@/lib/premium-ui';

/** Review changes (7h-7; 4.48 in the premium look): `/{tripId}/review/{changesetId}`. */
export default function ReviewRoute() {
  const { tripId, changesetId } = useLocalSearchParams<{ tripId: string; changesetId: string }>();
  const premium = usePremiumUi();
  return (
    <ChangesReviewScreen
      tripId={tripId ?? ''}
      changesetId={changesetId ?? ''}
      {...(premium ? { View: PremiumChangesView } : {})}
    />
  );
}
