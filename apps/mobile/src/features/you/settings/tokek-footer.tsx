/** Tokek over the version line: he wiggles when tapped, and five quick taps call `onFiveTaps`. */
import { useLingui } from '@lingui/react/macro';
import { useRef } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { tapTokek } from './tokek-taps';

const SIZE = 40;
const WIGGLE_DEG = 12;
const WIGGLE_MS = 90;

export function TokekFooter({ onFiveTaps }: { readonly onFiveTaps?: () => void }) {
  const { t } = useLingui();
  const reduced = useReducedImpactMotion();
  const rotate = useSharedValue(0);
  const taps = useRef<number[]>([]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  const tokek = guideSticker('tokek');

  const onPress = () => {
    if (!reduced) {
      rotate.value = withSequence(
        withTiming(-WIGGLE_DEG, { duration: WIGGLE_MS }),
        withTiming(WIGGLE_DEG, { duration: WIGGLE_MS }),
        withTiming(0, { duration: WIGGLE_MS }),
      );
    }
    const next = tapTokek(taps.current, Date.now());
    taps.current = next.taps;
    if (next.fire) onFiveTaps?.();
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="image"
      accessibilityLabel={t({ id: 'you.settings.tokek', message: 'Tokek, your guide' })}
      testID="you-settings-tokek"
    >
      <Animated.View style={style}>
        <Sticker kind={tokek.kind} name={tokek.name} size={SIZE} />
      </Animated.View>
    </Pressable>
  );
}
