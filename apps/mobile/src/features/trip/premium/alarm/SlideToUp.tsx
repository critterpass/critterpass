/**
 * "slide, I'm up →" (6.26): a 72 pt translucent track with a 60 pt sun knob. Dragging the knob to
 * the end confirms; letting go short springs it back (Smooth). Never a tap: a screen reader
 * activates it as one action.
 */
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, SPRINGS, Text, usePremiumTheme } from '@/ui/premium';

const KNOB = 60;
const PAD = 6;

export function SlideToUp(props: {
  readonly label: string;
  readonly actionLabel: string;
  readonly onConfirm: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const max = Math.max(0, width - KNOB - PAD * 2);
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      x.value = Math.min(max, Math.max(0, event.translationX));
    })
    .onEnd(() => {
      if (max > 0 && x.value >= max * 0.9) {
        x.value = withSpring(max, SPRINGS.smooth);
        scheduleOnRN(props.onConfirm);
      } else {
        x.value = withSpring(0, SPRINGS.smooth);
      }
    });
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(Math.round(event.nativeEvent.layout.width));
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={props.actionLabel}
      accessibilityActions={[{ name: 'activate', label: props.actionLabel }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') props.onConfirm();
      }}
      style={styles.full}
      testID={props.testID}
    >
      <View style={styles.track} onLayout={onLayout}>
        <View
          style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: th.color.onInkSurface }]}
        />
        <Text variant="button" color={th.color.onInkSurface} style={styles.label} align="center">
          {props.label}
        </Text>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.knob, { backgroundColor: th.accent.sun }, knob]}>
            <Icon name="forward" size={24} color={th.color.onAccent} />
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  track: {
    height: 72,
    borderRadius: 36,
    padding: PAD,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tint: { opacity: 0.14 },
  label: { position: 'absolute', left: KNOB + PAD, right: PAD, opacity: 0.8 },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
