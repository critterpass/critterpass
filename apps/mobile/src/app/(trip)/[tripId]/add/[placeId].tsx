import { useLocalSearchParams } from 'expo-router';

import { AddSheet, presetFromParams } from '@/features/plan/add';
import { PREMIUM_ADD_LOOK } from '@/features/plan/premium/add/add-look';
import { usePremiumUi } from '@/lib/premium-ui';

/** Add to plan (7f-1): `/{tripId}/add/{placeId}?day|dayId&start&after&pick&source`, a sheet over its caller. */
export default function AddToPlanRoute() {
  const params = useLocalSearchParams<{
    tripId: string;
    placeId: string;
    day?: string;
    dayId?: string;
    start?: string;
    after?: string;
  }>();
  const premium = usePremiumUi();
  return (
    <AddSheet
      tripId={params.tripId ?? ''}
      placeId={params.placeId ?? ''}
      preset={presetFromParams(params)}
      afterStableId={params.after}
      {...(premium ? { look: PREMIUM_ADD_LOOK } : {})}
    />
  );
}
