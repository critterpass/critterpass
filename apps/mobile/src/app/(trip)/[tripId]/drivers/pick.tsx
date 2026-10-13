import { useLocalSearchParams } from 'expo-router';

import { PickDaysSheet } from '@/features/drivers/pick/PickDaysSheet';
import { PickDaysPremium } from '@/features/drivers/premium/PickDaysPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Pick a driver's days (6d-2), a sheet over the comparison: `/{tripId}/drivers/pick?provider&days&quote`. */
export default function PickDaysRoute() {
  const { tripId, provider, days, quote } = useLocalSearchParams<{
    tripId: string;
    provider: string;
    days?: string;
    quote?: string;
  }>();
  const premium = usePremiumUi();
  const props = {
    tripId: tripId ?? '',
    providerId: provider ?? '',
    ...(days ? { days } : {}),
    ...(quote ? { quote } : {}),
  };
  return premium ? <PickDaysPremium {...props} /> : <PickDaysSheet {...props} />;
}
