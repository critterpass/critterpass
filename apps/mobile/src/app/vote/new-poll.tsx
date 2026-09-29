import { useLocalSearchParams } from 'expo-router';

import { CreatePollSheet } from '@/features/vote/poll/create-poll-sheet';

export default function NewPollRoute() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  return <CreatePollSheet crewId={crewId} />;
}
