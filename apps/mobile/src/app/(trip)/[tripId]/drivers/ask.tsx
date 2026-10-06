import { useLocalSearchParams } from 'expo-router';

import { AskForMeScreen } from '@/features/drivers/ask/AskForMeScreen';

/** Tokek's post for the groups (6b-1): `/{tripId}/drivers/ask?days=`. */
export default function AskForMeRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  return <AskForMeScreen tripId={tripId ?? ''} {...(days ? { days } : {})} />;
}
