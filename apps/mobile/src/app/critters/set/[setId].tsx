import { useLocalSearchParams } from 'expo-router';

import { SetScreen } from '@/features/critters/dex/set-screen';
import { PremiumSetScreen } from '@/features/critters/premium/set/set-screen';
import { premiumRoute } from '@/lib/premium-ui';

function useSetId(): string {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  return typeof setId === 'string' ? setId : '';
}

function CurrentSetRoute() {
  return <SetScreen setId={useSetId()} />;
}

function PremiumSetRoute() {
  return <PremiumSetScreen setId={useSetId()} />;
}

/** One place set (3l-8). */
export default premiumRoute({ premium: PremiumSetRoute, legacy: CurrentSetRoute });
