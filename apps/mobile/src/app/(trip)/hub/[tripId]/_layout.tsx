import { useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { TripStreams } from '@/features/trip/hub/local-first-gate';
import { pushTransition } from '@/lib/navigation/transitions';
import { usePremiumUi } from '@/lib/premium-ui';
import { useMotionMode } from '@/motion/motion-mode';
import { PremiumStack } from '@/ui/premium/shell/navigation/premium-stack';
import { useTheme } from '@/ui/theme';

/** A trip's day pages: keeps the trip's sync streams while one is open. */
export default function TripDayPagesTripLayout() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const premium = usePremiumUi();
  return (
    <>
      <TripStreams tripId={typeof tripId === 'string' ? tripId : null} />
      {premium ? (
        <PremiumStack />
      ) : (
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
      )}
    </>
  );
}
