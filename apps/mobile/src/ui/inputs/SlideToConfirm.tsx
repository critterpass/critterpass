import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useSlideToConfirm } from '@/motion/gestures/slide-to-confirm';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface SlideToConfirmProps {
  /** Track text ("Slide to board"). */
  readonly label: string;
  /** Screen-reader action name ("Board"): the non-gesture way to confirm. */
  readonly actionLabel: string;
  readonly onConfirm: () => void;
  /** The knob art, usually the trip guide's sticker. */
  readonly knob?: ReactNode;
  readonly disabled?: boolean;
  readonly testID?: string;
}

const TRACK_HEIGHT = 68;
const KNOB = 56;
const INSET = (TRACK_HEIGHT - KNOB) / 2;

const useStyles = makeStyles((t) => ({
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: t.semantic.bg.control,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: { textAlign: 'center', paddingStart: KNOB },
  knob: {
    position: 'absolute',
    start: INSET,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: t.semantic.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    start: 0,
    top: 0,
    bottom: 0,
    backgroundColor: t.semantic.action.primary,
    opacity: 0.25,
  },
}));

/** A 68 pt slide-to-confirm track (slide-to-board, SOS) with a knob and an a11y "confirm" action. */
export function SlideToConfirm({
  label,
  actionLabel,
  onConfirm,
  knob,
  disabled = false,
  testID,
}: SlideToConfirmProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const travel = Math.max(1, width - KNOB - INSET * 2);
  const slide = useSlideToConfirm({
    trackWidthPt: travel,
    onConfirm,
    disabled: disabled || width === 0,
    accessibilityLabel: actionLabel,
  });
  const fillStyle = useAnimatedStyle(() => ({
    width: slide.progress.value * travel + KNOB + INSET,
  }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View
      testID={testID}
      style={[styles.track, disabled ? { opacity: 0.4 } : null]}
      onLayout={onLayout}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityActions={disabled ? [] : slide.accessibilityActions}
      onAccessibilityAction={disabled ? undefined : slide.onAccessibilityAction}
    >
      <Animated.View style={[styles.fill, fillStyle]} />
      <Text variant="buttonLg" color={theme.semantic.text.secondary} style={styles.label}>
        {label}
      </Text>
      <GestureDetector gesture={slide.gesture}>
        <Animated.View style={[styles.knob, slide.animatedStyle]}>{knob}</Animated.View>
      </GestureDetector>
    </View>
  );
}
