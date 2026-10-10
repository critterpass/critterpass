import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import type {
  AccessibilityRole,
  AccessibilityState,
  Insets,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { premium } from '@cp/design-tokens';

import { usePremiumReducedMotion } from './reduced-motion';
import { SPRINGS } from './springs';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Extra touch area so a control smaller than 44 pt still takes a 44 pt tap. */
export function hitSlopFor(width: number, height: number): Insets {
  const h = Math.max(0, (premium.size.hit - width) / 2);
  const v = Math.max(0, (premium.size.hit - height) / 2);
  return { top: v, bottom: v, left: h, right: h };
}

export interface PressableScaleProps {
  readonly children: ReactNode | ((state: { readonly pressed: boolean }) => ReactNode);
  readonly onPress?: (() => void) | undefined;
  readonly onLongPress?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  /** Scale while held. @default the primary pill's 0.97 */
  readonly pressedScale?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly hitSlop?: Insets;
  readonly accessibilityRole?: AccessibilityRole;
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityHint?: string | undefined;
  readonly accessibilityState?: AccessibilityState;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly testID?: string | undefined;
}

/**
 * The premium press: scales toward `pressedScale` on the Snappy spring while held and back on
 * release, so it settles before the finger lifts. Reduce Motion keeps the pressed colour change
 * (callers draw it from `pressed`) and drops the scale.
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  pressedScale = premium.motion.pressScale,
  style,
  hitSlop,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  onLayout,
  testID,
}: PressableScaleProps) {
  const reduced = usePremiumReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pressTo = (to: number) => {
    if (reduced) return;
    scale.set(withSpring(to, SPRINGS.snappy));
  };

  return (
    <AnimatedPressable
      testID={testID}
      onPress={disabled === true ? undefined : onPress}
      onLongPress={disabled === true ? undefined : onLongPress}
      onPressIn={() => pressTo(pressedScale)}
      onPressOut={() => pressTo(1)}
      disabled={disabled === true}
      hitSlop={hitSlop}
      onLayout={onLayout}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled === true, ...accessibilityState }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
