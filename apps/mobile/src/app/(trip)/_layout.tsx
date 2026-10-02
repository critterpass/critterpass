import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useGateDecision } from '@/lib/navigation/gates';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

/** Trip-day stack (screens owned by the trip area); session-only, like the tabs. */
export default function TripLayout() {
  const decision = useGateDecision();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  if (decision.kind === 'wait') return null;
  if (decision.kind === 'redirect') return <Redirect href={decision.href} />;

  return (
    <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
      <Stack.Screen name="lock-screen-offer" options={modalGroupOptions()} />
    </Stack>
  );
}
