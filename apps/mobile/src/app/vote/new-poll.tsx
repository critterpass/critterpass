import { useLocalSearchParams } from 'expo-router';

import { CreatePollSheet } from '@/features/vote/poll/create-poll-sheet';
import { NewPollSheet } from '@/features/vote/premium/poll/new-poll-sheet';
import { usePremiumUi } from '@/lib/premium-ui';

/** New poll from the chat's "+" (3g-1; 4.01 in the premium look). */
export default function NewPollRoute() {
  const { crewId } = useLocalSearchParams<{ crewId: string }>();
  const Sheet = usePremiumUi() ? NewPollSheet : CreatePollSheet;
  return <Sheet crewId={crewId} />;
}
