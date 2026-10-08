import { Stack } from 'expo-router/js-stack';

import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { SessionGate } from '@/ui/states/SessionGate';

/**
 * Trip-day stack (screens owned by the trip area); session-only. Its layouts and screens read the
 * local database as they mount, so nothing under it renders before the session is up.
 */
export default function TripLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        <Stack.Screen name="lock-screen-offer" options={modalGroupOptions()} />
      </Stack>
    </SessionGate>
  );
}
