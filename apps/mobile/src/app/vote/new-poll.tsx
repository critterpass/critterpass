import { useLocalSearchParams } from 'expo-router';

import { NewPollSheet } from '@/features/vote/premium/poll/new-poll-sheet';

/** New poll from the chat's "+" (3g-1; 4.01). */
export default function NewPollRoute() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  return <NewPollSheet crewId={crewId} />;
}
