import { useLocalSearchParams } from 'expo-router';

import { PremiumWhySponsoredSheet } from '@/features/explore/premium/sponsored/why-sponsored-sheet';

function useSponsoredParams() {
  const { partner, place } = useLocalSearchParams<{ partner?: string; place?: string }>();
  return { partner: partner ?? '', place: place ?? '' };
}

/** "Why am I seeing this?" for a sponsored pick, as a native form sheet. */
export default function WhySponsoredRoute() {
  return <PremiumWhySponsoredSheet {...useSponsoredParams()} />;
}
