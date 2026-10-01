import { useLocalSearchParams } from 'expo-router';

import { WhySponsoredScreen } from '@/features/explore';

/** "Why am I seeing this?" for a sponsored pick (a fit sheet). */
export default function ExploreWhySponsoredRoute() {
  const { partner, place } = useLocalSearchParams<{ partner?: string; place?: string }>();
  return <WhySponsoredScreen partner={partner ?? ''} place={place ?? ''} />;
}
