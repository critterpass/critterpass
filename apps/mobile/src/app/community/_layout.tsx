import { Stack } from 'expo-router/js-stack';

import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { SessionGate } from '@/ui/states/SessionGate';
import { useTheme } from '@/ui/theme';

/** Crew plans, shared plans and plan links, pushed over the tabs or opened by a link; session-only. */
export default function CommunityLayout() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  return (
    <SessionGate>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </SessionGate>
  );
}
