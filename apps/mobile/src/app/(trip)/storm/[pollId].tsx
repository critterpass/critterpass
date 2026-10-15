import { useLocalSearchParams } from 'expo-router';

import { StormPremium } from '@/features/trip/premium/day-change/StormPremium';

/** A storm over a plan day (3k-8, 6.07): the options, the crew's vote and the booked seats. */
export default function StormRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return <StormPremium pollId={pollId} />;
}
