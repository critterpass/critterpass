import { useLocalSearchParams } from 'expo-router';

import { DecideScreen } from '@/features/plan/collab/decide-screen';

/** A live decision on the plan (`/{tripId}/decide/{pollId}`, 3g-2): options, votes and comments. */
export default function PlanDecideRoute() {
  const { tripId, pollId } = useLocalSearchParams<{ tripId: string; pollId: string }>();
  return <DecideScreen tripId={tripId} pollId={pollId} />;
}
