import { useLocalSearchParams } from 'expo-router';

import { OurDriversPremium } from '@/features/drivers/premium/OurDriversPremium';

/** Our drivers (6g-3): `/{tripId}/drivers/ours`. */
export default function OurDriversRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <OurDriversPremium tripId={tripId ?? ''} />;
}
