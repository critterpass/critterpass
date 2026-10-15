import { useLocalSearchParams } from 'expo-router';

import { RunningLatePremium } from '@/features/trip/premium/day-change/RunningLatePremium';

/** Running late (3k-9, 6.08): the ETA, what the late ones can do about it, and what the others are told. */
export default function RunningLateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RunningLatePremium id={id} />;
}
