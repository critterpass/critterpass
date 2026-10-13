import { useLocalSearchParams } from 'expo-router';

import { DecideScreen } from '@/features/plan/collab/decide-screen';
import { PremiumDecideView } from '@/features/plan/premium/decide/decide-view';
import { PremiumCommentsCard } from '@/features/plan/premium/stop/item-comments';
import { usePremiumUi } from '@/lib/premium-ui';

const PREMIUM_LOOK = { View: PremiumDecideView, Thread: PremiumCommentsCard };

/** A live decision on the plan (`/{tripId}/decide/{pollId}`, 3g-2): options, votes and comments. */
export default function PlanDecideRoute() {
  const { tripId, pollId } = useLocalSearchParams<{ tripId: string; pollId: string }>();
  const premium = usePremiumUi();
  return (
    <DecideScreen tripId={tripId} pollId={pollId} {...(premium ? { look: PREMIUM_LOOK } : {})} />
  );
}
