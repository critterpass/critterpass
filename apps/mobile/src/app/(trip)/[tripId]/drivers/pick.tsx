import { useLocalSearchParams } from 'expo-router';

import { PickDaysPremium } from '@/features/drivers/premium/PickDaysPremium';

/** Pick a driver's days (6d-2), a sheet over the comparison: `/{tripId}/drivers/pick?provider&days&quote`. */
export default function PickDaysRoute() {
  const { tripId, provider, days, quote } = useLocalSearchParams<{
    tripId: string;
    provider: string;
    days?: string;
    quote?: string;
  }>();
  const props = {
    tripId: tripId ?? '',
    providerId: provider ?? '',
    ...(days ? { days } : {}),
    ...(quote ? { quote } : {}),
  };
  return <PickDaysPremium {...props} />;
}
