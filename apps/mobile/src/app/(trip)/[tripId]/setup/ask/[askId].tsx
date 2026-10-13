import { useLocalSearchParams } from 'expo-router';

import { PremiumAskSheetView } from '@/features/setup/premium/ask/ask-sheet';
import { PremiumWaiting } from '@/features/setup/premium/must-dos/sheet-waiting';
import { AskSheetScreen } from '@/features/setup/when';
import { usePremiumUi } from '@/lib/premium-ui';

const PREMIUM_LOOK = { View: PremiumAskSheetView, Waiting: PremiumWaiting };

/** The guide's private ask about a maybe block (`/{tripId}/setup/ask/{askId}`, from its push). */
export default function AskRoute() {
  const { tripId, askId, answered } = useLocalSearchParams<{
    tripId: string;
    askId: string;
    answered?: string;
  }>();
  const premium = usePremiumUi();
  return (
    <AskSheetScreen
      tripId={tripId}
      askId={askId}
      answered={answered !== undefined}
      {...(premium ? { look: PREMIUM_LOOK } : {})}
    />
  );
}
