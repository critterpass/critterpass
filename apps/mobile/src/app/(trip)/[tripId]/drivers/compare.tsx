import { useLocalSearchParams } from 'expo-router';

import { CompareScreen } from '@/features/drivers/compare/CompareScreen';

/** Compare the shortlist (6d-1): `/{tripId}/drivers/compare?days=`. */
export default function CompareRoute() {
  const { tripId, days } = useLocalSearchParams<{ tripId: string; days?: string }>();
  return <CompareScreen tripId={tripId ?? ''} {...(days ? { days } : {})} />;
}
