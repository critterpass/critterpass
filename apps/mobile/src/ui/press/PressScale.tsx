import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type {
  AccessibilityRole,
  AccessibilityState,
  AccessibilityValue,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { withTapFeedback } from '@/motion/feedback';
import { usePress } from '@/motion/gestures/press';
import type { PressWidthClass } from '@/motion/gestures/press';
import type { SoundCueId } from '@/motion/impact';

import { touchSlop } from '../theme';

export interface PressScaleProps {
  readonly onPress?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  /**
   * The cue (haptic and sound) a tap fires through the feedback bus, after `onPress`. Skipped when
   * `onPress` fired a cue of its own, so a tap is never answered twice. @default none
   */
  readonly feedback?: SoundCueId | undefined;
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

/** A fixed size the style declares on one axis, if any. */
function declared(size: ViewStyle['height'], minimum: ViewStyle['minHeight']): number | undefined {
  if (typeof size === 'number') return size;
  return typeof minimum === 'number' ? minimum : undefined;
}

/** The control's size on screen once it has been laid out. */
interface Measured {
  readonly width: number;
  readonly height: number;
}

/**
 * Touch slop from the measured size, else the size the style declares: a declared size has its
 * slop from the first frame, and the first layout adds what a size-to-content control needs.
 */
export function pressSlop(style: ViewStyle, measured: Measured | undefined) {
  return touchSlop(
    measured?.height ?? declared(style.height, style.minHeight),
    measured?.width ?? declared(style.width, style.minWidth),
  );
}

/**
 * The library's one tappable wrapper: the motion kit's press scale + release overshoot, the
 * `activate` accessibility action wired to the same handler (so VoiceOver/TalkBack and Switch
 * Control reach it), a 44 pt (48 dp) minimum target, and `disabled` reflected in a11y state.
 *
 * The control takes only its drawn size in layout: one under the minimum (a 32 pt chip, a 28 pt
 * avatar) reaches the target through invisible touch slop, never through a taller or wider box.
 */
export function PressScale({
  onPress,
  disabled = false,
  feedback,
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
  const [measured, setMeasured] = useState<Measured>();
  const drawn: ViewStyle = StyleSheet.flatten(style) ?? {};
  const slop = pressSlop(drawn, measured);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const next = pressSlop(drawn, { width, height });
    // Only a size that changes the slop is kept, so a control that already had it right (most of
    // them) never renders twice.
    if (next?.top !== slop?.top || next?.left !== slop?.left) setMeasured({ width, height });
  };
  const press = usePress({
    disabled: disabled || !onPress,
    accessibilityLabel,
    hitSlop: slop,
    ...(widthClass ? { widthClass } : {}),
    ...(onPress
      ? { onPress: feedback === undefined ? onPress : () => withTapFeedback(feedback, onPress) }
      : {}),
  });
  return (
    <GestureDetector gesture={press.gesture}>
      <Animated.View
        testID={testID}
        hitSlop={slop}
        onLayout={onLayout}
        accessible
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ ...accessibilityState, disabled }}
        accessibilityValue={accessibilityValue}
        accessibilityActions={disabled ? [] : press.accessibilityActions}
        onAccessibilityAction={disabled ? undefined : press.onAccessibilityAction}
        style={[style, press.animatedStyle]}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
