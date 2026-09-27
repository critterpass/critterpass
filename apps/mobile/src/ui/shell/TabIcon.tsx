import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Sticker } from '../sticker/Sticker';

/** Doodle icons of the tab bar (design/doodles.js `pin`, `ticket`, `wallet`, `egg`). */
export type TabIconKind = 'pin' | 'ticket' | 'wallet' | 'egg';

export const TAB_ICON_SIZE = tokens.space['24'];

// docs/design-system.md §2.1 "icon bounce" on select: a `back`-eased pop, one `fast` beat each way.
const BOUNCE_SCALE = 1.18;
const bounceIn = bezierEasing(tokens.motion.easing.back);
const settle = bezierEasing(tokens.motion.easing.standard);

export interface TabIconProps {
  readonly kind: TabIconKind;
  readonly color: string;
  readonly focused: boolean;
}

/**
 * A doodle icon drawn by the critter-art pipeline as a single-colour mask (no die-cut edge), so
 * the same art recolours for active (yellow) and inactive (ink.300). Decorative: the tab button
 * carries the label.
 */
export function TabIcon({ kind, color, focused }: TabIconProps) {
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!focused || reduced) return;
    scale.value = withSequence(
      withTiming(BOUNCE_SCALE, { duration: tokens.motion.duration.fast, easing: bounceIn }),
      withTiming(1, { duration: tokens.motion.duration.fast, easing: settle }),
    );
  }, [focused, reduced, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={style}>
        <Sticker
          kind={kind}
          name={kind}
          size={TAB_ICON_SIZE}
          variant="mask"
          maskColor={color}
          sticker={null}
        />
      </Animated.View>
    </View>
  );
}
