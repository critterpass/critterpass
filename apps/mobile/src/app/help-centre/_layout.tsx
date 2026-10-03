import { Redirect } from 'expo-router';
import { Stack } from 'expo-router/js-stack';

import { FeedbackRuntime } from '@/features/help/feedback/device-outbox';
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

  // Notes written offline go out from here: whenever the help centre is open and online.
  return (
    <>
      <FeedbackRuntime />
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')} />
    </>
  );
}
