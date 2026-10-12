import { useLocalSearchParams } from 'expo-router';

import { StormScreen } from '@/features/trip/disruptions/storm/screen';
import { StormPremium } from '@/features/trip/premium/day-change/StormPremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** A storm over a plan day (3k-8, 6.07): the options, the crew's vote and the booked seats. */
export default function StormRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  const premium = usePremiumUi();
  return premium ? <StormPremium pollId={pollId} /> : <StormScreen pollId={pollId} />;
}
