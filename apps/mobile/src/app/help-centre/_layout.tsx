import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { useGateDecision } from '@/lib/navigation/gates';
import { pushTransition } from '@/lib/navigation/transitions';
import { useMotionMode } from '@/motion/motion-mode';
import { useTheme } from '@/ui';

/** The help centre and feedback, pushed from Settings; session-only. */
export default function HelpCentreLayout() {
  const decision = useGateDecision();
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();

  if (decision.kind === 'wait') return null;
  if (decision.kind === 'redirect') return <Redirect href={decision.href} />;

  return <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />;
}
