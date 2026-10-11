/** Stamped (4b-5) on the current UI: a burst once the boost row arrives, then the view. */
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { deviceTier, impact } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';

import { StampedView } from './stamped-view';
import { useStampedScreen } from './use-stamped-screen';

export function StampedScreen() {
  const props = useStampedScreen();
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  const { boosted } = props;
  useEffect(() => {
    if (!boosted) return;
    impact('success');
    if (motionMode === 'full') triggerConfetti(width / 2, height * 0.3, 'medium', deviceTier);
    // Once, when the boost row arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boosted]);
  return <StampedView {...props} />;
}
