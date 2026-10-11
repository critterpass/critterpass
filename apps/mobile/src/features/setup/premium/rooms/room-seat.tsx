/**
 * One person's seat in the rooms editor (7.08): a 44 avatar over their name. Long-press lifts it
 * (tilted −8°, scaled 1.12, white ring, the peel haptic), dragging follows the finger and letting
 * go reports where it landed; it springs home either way, and the plan redraws it in its new room.
 * A tap picks it instead, the path screen readers use: then tapping a room moves it there. Reduce
 * Motion drops the tilt and the spring.
 */
import { useLingui } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { crewAccent } from '@/features/trip';
import { LONG_PRESS_DURATION_MS } from '@/motion/gestures';
import { useMotionMode } from '@/motion/motion-mode';
import { Avatar, PressableScale, ring, SPRINGS, Text, usePremiumTheme } from '@/ui/premium';

const SEAT = 52;
const FACE = 44;

export function RoomSeat(props: {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly picked: boolean;
  readonly draggable: boolean;
  readonly onPick: (uid: string) => void;
  readonly onLift: () => void;
  readonly onDrop: (uid: string, x: number, y: number) => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const [motionMode] = useMotionMode();
  const reduced = motionMode !== 'full';
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  const { uid, name } = props;
  const drop = (absX: number, absY: number) => props.onDrop(uid, absX, absY);
  const lift = () => props.onLift();
  const pan = Gesture.Pan()
    .enabled(props.draggable)
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      'worklet';
      lifted.value = 1;
      scheduleOnRN(lift);
    })
    .onUpdate((event) => {
      'worklet';
      x.value = event.translationX;
      y.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(drop, event.absoluteX, event.absoluteY);
    })
    .onFinalize(() => {
      'worklet';
      lifted.value = 0;
      x.value = reduced ? 0 : withSpring(0, SPRINGS.smooth);
      y.value = reduced ? 0 : withSpring(0, SPRINGS.smooth);
    });
  const moving = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { rotate: lifted.value === 1 && !reduced ? '-8deg' : '0deg' },
      { scale: lifted.value === 1 && !reduced ? 1.12 : 1 },
    ],
    zIndex: lifted.value === 1 ? 10 : 0,
  }));
  const face = (
    <View
      style={[
        styles.face,
        props.picked ? { boxShadow: ring(3, th.accent.sky) } : null,
        { borderRadius: FACE / 2 },
      ]}
    >
      <Avatar name={name} color={crewAccent(props.joinIndex)} size={FACE} />
    </View>
  );
  const label = props.picked
    ? t({ id: 'setup.rooms.a11y.selected', message: `${name}, picked. Tap a room to move them.` })
    : t({ id: 'setup.rooms.a11y.person', message: `${name}. Tap to move to another room.` });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.seat, moving]}>
        {props.draggable ? (
          <PressableScale
            onPress={() => props.onPick(uid)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: props.picked }}
            testID={`setup-rooms-person-${uid}`}
          >
            {face}
          </PressableScale>
        ) : (
          <View accessible accessibilityLabel={name} testID={`setup-rooms-person-${uid}`}>
            {face}
          </View>
        )}
        <Text variant="captionMuted" numberOfLines={1} align="center">
          {name}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  seat: { width: SEAT, alignItems: 'center', gap: 2 },
  face: { width: FACE, height: FACE },
});
