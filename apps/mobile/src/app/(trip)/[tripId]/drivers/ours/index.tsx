import { useLocalSearchParams } from 'expo-router';

import { OurDriversScreen } from '@/features/drivers/ours/OurDriversScreen';
import { OurDriversPremium } from '@/features/drivers/premium/OurDriversPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Our drivers (6g-3): `/{tripId}/drivers/ours`. */
export default function OurDriversRoute() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const premium = usePremiumUi();
  return premium ? (
    <OurDriversPremium tripId={tripId ?? ''} />
  ) : (
    <OurDriversScreen tripId={tripId ?? ''} />
  );
}
