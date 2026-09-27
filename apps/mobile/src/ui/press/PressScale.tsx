import type { ReactNode } from 'react';
import type {
  AccessibilityRole,
  AccessibilityState,
  AccessibilityValue,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { usePress } from '@/motion/gestures/press';
import type { PressWidthClass } from '@/motion/gestures/press';

import { MIN_TOUCH_TARGET } from '../theme';

export interface PressScaleProps {
  readonly onPress?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  /** Press depth by control width (narrow < 120 pt presses deepest). @default 'medium' */
  readonly widthClass?: PressWidthClass | undefined;
  readonly accessibilityLabel: string;
  readonly accessibilityHint?: string | undefined;
  /** @default 'button' */
  readonly accessibilityRole?: AccessibilityRole | undefined;
  readonly accessibilityState?: AccessibilityState | undefined;
  readonly accessibilityValue?: AccessibilityValue | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

/**
 * The library's one tappable wrapper: the motion kit's press scale + release overshoot, the
 * `activate` accessibility action wired to the same handler (so VoiceOver/TalkBack and Switch
 * Control reach it), a 44 pt (48 dp) minimum target, and `disabled` reflected in a11y state.
 */
export function PressScale({
  onPress,
  disabled = false,
  widthClass,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityValue,
  style,
  children,
  testID,
}: PressScaleProps) {
  const press = usePress({
    disabled: disabled || !onPress,
    accessibilityLabel,
    ...(widthClass ? { widthClass } : {}),
    ...(onPress ? { onPress } : {}),
  });
  return (
    <GestureDetector gesture={press.gesture}>
      <Animated.View
        testID={testID}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ ...accessibilityState, disabled }}
        accessibilityValue={accessibilityValue}
        accessibilityActions={disabled ? [] : press.accessibilityActions}
        onAccessibilityAction={disabled ? undefined : press.onAccessibilityAction}
        style={[
          { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET },
          style,
          press.animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
