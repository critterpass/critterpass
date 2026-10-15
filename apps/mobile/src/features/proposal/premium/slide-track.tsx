/** Slide to board: a thumb dragged along the track; past 92% of it the member is on board. */
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon, SPRINGS, Text, usePremiumTheme } from '@/ui/premium';

const TRACK = 68;
const THUMB = 56;

export function SlideTrack(props: {
  readonly label: string;
  readonly onDone: () => void;
  readonly disabled: boolean;
}) {
  const theme = usePremiumTheme();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const end = Math.max(0, width - THUMB - 12);
  const pan = Gesture.Pan()
    .enabled(!props.disabled)
    .onUpdate((event) => {
      'worklet';
      x.set(Math.max(0, Math.min(end, event.translationX)));
    })
    .onEnd(() => {
      'worklet';
      if (end > 0 && x.get() >= end * 0.92) {
        x.set(end);
        scheduleOnRN(props.onDone);
      } else {
        x.set(withSpring(0, SPRINGS.snappy));
      }
    });
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => props.onDone()}
      testID="board-slide"
      style={{
        height: TRACK,
        borderRadius: TRACK / 2,
        backgroundColor: theme.color.inkSurface,
        padding: 6,
        justifyContent: 'center',
      }}
    >
      <Text
        variant="button"
        tone="onInk"
        align="center"
        style={{ position: 'absolute', left: 0, right: 0, opacity: 0.75 }}
      >
        {props.label}
      </Text>
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: theme.accent.sun,
              alignItems: 'center',
              justifyContent: 'center',
            },
            thumb,
          ]}
        >
          <Icon name="forward" size={24} color={theme.color.onAccent} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
