import { useLocalSearchParams } from 'expo-router';

import { PremiumRoomsStep } from '@/features/setup/premium/rooms/premium-rooms-step';
import { PREMIUM_STEP_VIEWS } from '@/features/setup/premium/steps/premium-steps';
import { SetupScreen } from '@/features/setup/shell/setup-screen';
import { stepFromSlug } from '@/features/setup/shell/steps';
import { usePremiumUi } from '@/lib/premium-ui';

/** The premium step pages: the shared set, and the rooms pages (who sleeps where, 7.07–7.09). */
const PREMIUM_VIEWS = { ...PREMIUM_STEP_VIEWS, rooms: PremiumRoomsStep };

/**
 * One setup step (`/{tripId}/setup/when|budget|rooms|must-dos`). From the premium checklist the
 * steps open in any order once the dates are locked.
 */
export default function SetupStepRoute() {
  const { tripId, step } = useLocalSearchParams<{ tripId: string; step: string }>();
  const premium = usePremiumUi();
  return (
    <SetupScreen
      tripId={tripId}
      step={stepFromSlug(step)}
      anyOrder={premium}
      {...(premium ? { views: PREMIUM_VIEWS } : {})}
    />
  );
}
