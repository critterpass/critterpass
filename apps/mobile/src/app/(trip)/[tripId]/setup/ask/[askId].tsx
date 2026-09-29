import { useLocalSearchParams } from 'expo-router';

import { AskSheetScreen } from '@/features/setup/when';

/** The guide's private ask about a maybe block (`/{tripId}/setup/ask/{askId}`, from its push). */
export default function AskRoute() {
  const { tripId, askId, answered } = useLocalSearchParams<{
    tripId: string;
    askId: string;
    answered?: string;
  }>();
  return <AskSheetScreen tripId={tripId} askId={askId} answered={answered !== undefined} />;
}
