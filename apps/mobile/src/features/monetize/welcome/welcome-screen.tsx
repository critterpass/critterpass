/** The welcome (4e-3) on the current UI: a burst of confetti once Pass+ is on, then the view. */
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { deviceTier, impact } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';

import { useWelcomeScreen } from './use-welcome-screen';
import { WelcomeView } from './welcome-view';

export function WelcomeScreen() {
  const props = useWelcomeScreen();
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  const { passPlus, celebrate } = props;
  useEffect(() => {
    if (!passPlus || !celebrate) return;
    impact('success');
    if (motionMode === 'full') triggerConfetti(width / 2, height * 0.35, 'large', deviceTier);
    // Once, when Pass+ turns on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passPlus, celebrate]);
  return <WelcomeView {...props} />;
}
