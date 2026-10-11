import { useLocalSearchParams } from 'expo-router';

import { RunningLateScreen } from '@/features/trip/disruptions/late/screen';
import { RunningLatePremium } from '@/features/trip/premium/day-change/RunningLatePremium';
import { usePremiumUi } from '@/lib/premium-ui';

/** Running late (3k-9, 6.08): the ETA, what the late ones can do about it, and what the others are told. */
export default function RunningLateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const premium = usePremiumUi();
  return premium ? <RunningLatePremium id={id} /> : <RunningLateScreen id={id} />;
}
