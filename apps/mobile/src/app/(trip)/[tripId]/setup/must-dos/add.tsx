import { useLocalSearchParams } from 'expo-router';

import { AddMustDoSheet } from '@/features/setup/must-dos';
import { PREMIUM_ADD_MUST_DO } from '@/features/setup/premium/must-dos/add-must-do-sheet';
import { usePremiumUi } from '@/lib/premium-ui';

/** The add-a-must-do sheet over the must-dos step (`/{tripId}/setup/must-dos/add`). */
export default function AddMustDoRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return <AddMustDoSheet tripId={tripId} {...(premium ? { look: PREMIUM_ADD_MUST_DO } : {})} />;
}
