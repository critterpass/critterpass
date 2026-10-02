import { useLocalSearchParams } from 'expo-router';

import { RunningLateScreen } from '@/features/trip/disruptions/late/screen';

/** Running late (3k-9): the ETA, what the late ones can do about it, and what the others are told. */
export default function RunningLateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RunningLateScreen id={id} />;
}
