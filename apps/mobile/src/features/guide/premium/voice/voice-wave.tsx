/** Voice mode's live waveform: bars that follow the microphone level as the guide listens. */
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { usePremiumTheme } from '@/ui/premium';

import type { VoiceViewProps } from '../../voice/voice-view';

export function Bar({
  index,
  level,
}: {
  readonly index: number;
  readonly level: VoiceViewProps['level'];
}) {
  const th = usePremiumTheme();
  // Each bar has its own share of the level, so the line moves like a voice, not a block.
  const shape = 0.35 + 0.65 * Math.abs(Math.sin(index * 1.7));
  const style = useAnimatedStyle(() => ({
    height: Math.max(4, Math.min(34, 34 * level.value * shape)),
  }));
  return (
    <Animated.View style={[{ width: 4, borderRadius: 2, backgroundColor: th.color.ink }, style]} />
  );
}
