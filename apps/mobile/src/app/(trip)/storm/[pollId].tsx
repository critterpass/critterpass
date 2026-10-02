import { useLocalSearchParams } from 'expo-router';

import { StormScreen } from '@/features/trip/disruptions/storm/screen';

/** A storm over a plan day (3k-8): the options, the crew's vote and what happens to booked seats. */
export default function StormRoute() {
  const { pollId } = useLocalSearchParams<{ pollId: string }>();
  return <StormScreen pollId={pollId} />;
}
