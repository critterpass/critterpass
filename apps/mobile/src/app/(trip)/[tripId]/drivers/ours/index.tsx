import { useLocalSearchParams } from 'expo-router';

import { OurDriversScreen } from '@/features/drivers/ours/OurDriversScreen';

/** Our drivers (6g-3): `/{tripId}/drivers/ours`. */
export default function OurDriversRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <OurDriversScreen tripId={tripId ?? ''} />;
}
