import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { SessionGate } from '@/ui/states/SessionGate';

/** Critterdex pages pushed from the PASS tab (screens owned by the critters area); session-only. */
export default function CrittersLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </SessionGate>
  );
}
