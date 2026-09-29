/**
 * Everyone who shares is at the meet-up: a small confetti burst (skipped with reduced motion) and
 * "Everyone's here" in the panel.
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { deviceTier, feedback } from '@/motion';
import { useMotionMode } from '@/motion/motion-mode';
import { triggerConfetti } from '@/motion/patterns/confetti';
import { Stack, Text } from '@/ui';

export function AllArrived() {
  const [motionMode] = useMotionMode();
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    feedback.emit('success');
    if (motionMode === 'full') triggerConfetti(width / 2, height * 0.55, 'small', deviceTier);
    // Once per arrival, not on every resize.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Stack gap="4" align="center" testID="live-all-arrived">
      <Text variant="h3" accessibilityRole="header" accessibilityLiveRegion="polite">
        {t({ id: 'liveMap.arrived.title', message: "Everyone's here" })}
      </Text>
    </Stack>
  );
}
