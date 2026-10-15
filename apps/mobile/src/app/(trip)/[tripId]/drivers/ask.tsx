import { useLocalSearchParams } from 'expo-router';

import { AskForMePremium } from '@/features/drivers/premium/AskForMePremium';

/** Tokek's post for the groups (6b-1): `/{tripId}/drivers/ask?days=`. */
export default function AskForMeRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  const props = { tripId: tripId ?? '', ...(days ? { days } : {}) };
  return <AskForMePremium {...props} />;
}
