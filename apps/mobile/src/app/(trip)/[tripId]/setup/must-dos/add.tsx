import { useLocalSearchParams } from 'expo-router';

import { AddMustDoSheet } from '@/features/setup/must-dos';
import { PREMIUM_ADD_MUST_DO } from '@/features/setup/premium/must-dos/add-must-do-sheet';

/** The add-a-must-do sheet over the must-dos step (`/{tripId}/setup/must-dos/add`). */
export default function AddMustDoRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <AddMustDoSheet tripId={tripId} look={PREMIUM_ADD_MUST_DO} />;
}
