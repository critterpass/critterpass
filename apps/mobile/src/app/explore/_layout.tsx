import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useGateDecision } from '@/lib/navigation/gates';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

/** Explore pages pushed from Home, a trip or a link (screens owned by the explore area); session-only. */
export default function ExploreLayout() {
  const decision = useGateDecision();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  if (decision.kind === 'wait') return null;
  if (decision.kind === 'redirect') return <Redirect href={decision.href} />;

  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
