import { useLocalSearchParams } from 'expo-router';

import { DriverSharePremium } from '@/features/drivers/premium/DriverSharePremium';

/** Share with your driver (6i-1), a sheet over the plan's share sheet: `/{tripId}/drivers/share`. */
export default function DriverShareRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <DriverSharePremium tripId={tripId ?? ''} />;
}
