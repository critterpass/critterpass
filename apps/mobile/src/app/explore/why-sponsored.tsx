import { useLocalSearchParams } from 'expo-router';

import { WhySponsoredScreen } from '@/features/explore';
import { PremiumWhySponsoredSheet } from '@/features/explore/premium/sponsored/why-sponsored-sheet';
import { premiumRoute } from '@/lib/premium-ui';

function useSponsoredParams() {
  const { partner, place } = useLocalSearchParams<{ partner?: string; place?: string }>();
  return { partner: partner ?? '', place: place ?? '' };
}

/** "Why am I seeing this?" for a sponsored pick (`/explore/why-sponsored?partner=&place=`). */
function CurrentWhySponsoredRoute() {
  return <WhySponsoredScreen {...useSponsoredParams()} />;
}

/** The same words as a native form sheet in the premium look. */
function PremiumWhySponsoredRoute() {
  return <PremiumWhySponsoredSheet {...useSponsoredParams()} />;
}

export default premiumRoute({
  premium: PremiumWhySponsoredRoute,
  legacy: CurrentWhySponsoredRoute,
});
