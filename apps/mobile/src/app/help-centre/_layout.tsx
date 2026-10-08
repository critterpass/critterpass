import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';
import { SessionGate } from '@/ui/states/SessionGate';

/** The help centre and feedback, pushed from Settings; session-only. */
export default function HelpCentreLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </SessionGate>
  );
}
