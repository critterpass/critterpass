import { useLocalSearchParams } from 'expo-router';

import { PickDaysSheet } from '@/features/drivers/pick/PickDaysSheet';

/** Pick a driver's days (6d-2), a sheet over the comparison: `/{tripId}/drivers/pick?provider&days&quote`. */
export default function PickDaysRoute() {
  const { tripId, provider, days, quote } = useLocalSearchParams<{
    tripId: string;
    provider: string;
    days?: string;
    quote?: string;
  }>();
  return (
    <PickDaysSheet
      tripId={tripId ?? ''}
      providerId={provider ?? ''}
      {...(days ? { days } : {})}
      {...(quote ? { quote } : {})}
    />
  );
}
