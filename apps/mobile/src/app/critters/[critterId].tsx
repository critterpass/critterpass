import { useLocalSearchParams } from 'expo-router';

import { DetailScreen } from '@/features/critters/detail/detail-screen';
import { PremiumCritterDetailScreen } from '@/features/critters/premium/detail/critter-detail-screen';
import { premiumRoute } from '@/lib/premium-ui';

function CurrentCritterDetailRoute() {
  const { critterId } = useLocalSearchParams<{ critterId: string }>();
  return <DetailScreen critterId={typeof critterId === 'string' ? critterId : ''} />;
}

/** A critter's detail (3l-3). */
export default premiumRoute({
  premium: PremiumCritterDetailScreen,
  legacy: CurrentCritterDetailRoute,
});
