/**
 * One person in a room: long-press lifts the avatar (320 ms, the kit's long-press), dragging
 * follows the finger and letting go reports where it landed; it springs home either way (the
 * plan re-renders it in its new room). A tap selects it instead, the path screen readers use:
 * then tapping a room moves it there. Reduced motion drops the lift and the spring.
 */
import { t } from '@lingui/core/macro';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { springConfig, isPhysicalSpring } from '@/motion';
import { LONG_PRESS_DURATION_MS } from '@/motion/gestures';
import { useMotionMode } from '@/motion/motion-mode';
import { Avatar } from '@/ui/people/Avatar';
import { PressScale } from '@/ui/press/PressScale';
import { makeStyles } from '@/ui/theme';

const SNAPPY = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;
const LIFT_SCALE = 1.15;

const useStyles = makeStyles((th) => ({
  ring: {
    borderRadius: th.radius.xl,
    borderWidth: th.ring.focus.widthPt,
    borderColor: 'transparent',
  },
  picked: { borderColor: th.ring.focus.color },
}));

export interface DraggableAvatarProps {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
  readonly selected: boolean;
  /** False for members (read-only plan) and once the rooms are locked. */
  readonly draggable: boolean;
  readonly onSelect: (uid: string) => void;
  readonly onLift: () => void;
  readonly onDrop: (uid: string, x: number, y: number) => void;
  readonly highlight?: boolean;
}

export function DraggableAvatar({
  uid,
  name,
  joinIndex,
  selected,
  draggable,
  onSelect,
  onLift,
  onDrop,
  highlight = false,
}: DraggableAvatarProps) {
  const styles = useStyles();
  const [motionMode] = useMotionMode();
  const reduced = motionMode !== 'full';
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  const drop = (absX: number, absY: number) => onDrop(uid, absX, absY);
  const lift = () => onLift();
  const home = (value: number) => {
    'worklet';
    return reduced || SNAPPY === undefined ? 0 : withSpring(value, SNAPPY);
  };
  const pan = Gesture.Pan()
    .enabled(draggable)
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
      x.value = home(0);
      y.value = home(0);
    });
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: lifted.value === 1 && !reduced ? LIFT_SCALE : 1 },
    ],
    zIndex: lifted.value === 1 ? 10 : 0,
  }));
  const label = selected
    ? t({ id: 'setup.rooms.a11y.selected', message: `${name}, picked. Tap a room to move them.` })
    : t({ id: 'setup.rooms.a11y.person', message: `${name}. Tap to move to another room.` });
  const face = (
    <Animated.View style={[styles.ring, selected || highlight ? styles.picked : null]}>
      <Avatar name={name} joinIndex={joinIndex} size="md" decorative />
    </Animated.View>
  );
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>
        {draggable ? (
          <PressScale
            onPress={() => onSelect(uid)}
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            widthClass="narrow"
            testID={`setup-rooms-person-${uid}`}
          >
            {face}
          </PressScale>
        ) : (
          <Animated.View accessible accessibilityLabel={name} testID={`setup-rooms-person-${uid}`}>
            {face}
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
