/**
 * One idea in the Ideas list (7f-2): the place row with its fit line and the faces of whoever
 * saved it, and a drag handle. Holding the row (320 ms) lifts it; it follows the finger and tells
 * the screen which day chip it is over only when that changes; letting go over a chip opens Add to
 * plan on that day, anywhere else it springs home. A tap opens the place. Screen readers get "Add
 * to a day…", which opens Add to plan without dragging; a tap on the handle offers that and the
 * ways to remove the idea.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import type { AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { PlaceTilePhoto } from '@/data/media/use-place-tile-photos';
import { isPhysicalSpring, springConfig } from '@/motion';
import { impact } from '@/motion/feedback';
import { LONG_PRESS_DURATION_MS } from '@/motion/gestures';
import { usePress } from '@/motion/gestures/press';
import { useMotionMode } from '@/motion/motion-mode';
import type { DoodleName } from '@/ui/icons/generated';
import type { StackMember } from '@/ui/people/AvatarStack';
import { PressScale } from '@/ui/press/PressScale';
import { PlaceRow, type FitTone } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { dragHit, type ChipLayout, type ChipRowFrame } from './drag-hit';

const SNAPPY = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;
const HANDLE = '⋮⋮';

export interface IdeaRowProps {
  readonly ideaId: string;
  readonly name: string;
  readonly icon: DoodleName;
  /** The place's photo, when it has one. */
  readonly photo?: PlaceTilePhoto | undefined;
  readonly fitLine: { readonly text: string; readonly tone: FitTone } | undefined;
  readonly savers: readonly StackMember[];
  readonly frame: SharedValue<ChipRowFrame>;
  readonly layout: SharedValue<ChipLayout>;
  readonly onLift: (ideaId: string) => void;
  readonly onOver: (index: number) => void;
  readonly onDrop: (ideaId: string, index: number) => void;
  readonly onCancel: () => void;
  readonly onOpen: () => void;
  /** Add to plan without dragging (the screen reader's action); null while there is no plan to add to. */
  readonly onAddToDay: (() => void) | null;
  /** The handle's tap: what can be done with the idea (add to a day, remove). */
  readonly onMore: () => void;
}

export function IdeaRow(props: IdeaRowProps) {
  const { t } = useLingui();
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const reduced = motionMode !== 'full';
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  const lastHit = useSharedValue(-1);
  const { ideaId, frame, layout } = props;
  const lift = () => {
    impact('peel');
    props.onLift(ideaId);
  };
  const over = (index: number) => props.onOver(index);
  const finish = (index: number) => {
    if (index < 0) props.onCancel();
    else props.onDrop(ideaId, index);
  };
  const home = () => {
    'worklet';
    return reduced || SNAPPY === undefined ? 0 : withSpring(0, SNAPPY);
  };
  const pan = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .onStart(() => {
      'worklet';
      lifted.value = 1;
      lastHit.value = -1;
      scheduleOnRN(lift);
    })
    .onUpdate((event) => {
      'worklet';
      x.value = event.translationX;
      y.value = event.translationY;
      const hit = dragHit(frame.value, layout.value, event.absoluteX, event.absoluteY);
      if (hit !== lastHit.value) {
        lastHit.value = hit;
        scheduleOnRN(over, hit);
      }
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(finish, dragHit(frame.value, layout.value, event.absoluteX, event.absoluteY));
    })
    .onFinalize(() => {
      'worklet';
      lifted.value = 0;
      x.value = home();
      y.value = home();
    });
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: lifted.value === 1 && !reduced ? 1.03 : 1 },
    ],
    zIndex: lifted.value === 1 ? 10 : 0,
    backgroundColor: lifted.value === 1 ? theme.semantic.bg.raised : 'transparent',
  }));
  const press = usePress({ widthClass: 'wide', onPress: props.onOpen });
  const addLabel = t({ id: 'plan.ideas.addToDay', message: 'Add to a day…' });
  const moreLabel = t({ id: 'plan.ideas.more', message: 'Add to a day, or remove' });
  const label = [props.name, props.fitLine?.text].filter((part) => part !== undefined).join(', ');
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') props.onOpen();
    if (event.nativeEvent.actionName === 'addToDay') props.onAddToDay?.();
    if (event.nativeEvent.actionName === 'more') props.onMore();
  };
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={style}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={[
          { name: 'activate', label: props.name },
          ...(props.onAddToDay === null ? [] : [{ name: 'addToDay', label: addLabel }]),
          { name: 'more', label: moreLabel },
        ]}
        onAccessibilityAction={onAction}
        testID={`plan-idea-${ideaId}`}
      >
        <GestureDetector gesture={press.gesture}>
          <Animated.View style={press.animatedStyle}>
            <PlaceRow
              title={props.name}
              icon={props.icon}
              {...props.photo?.tile}
              fitLine={props.fitLine}
              savers={props.savers}
              saversAtEnd
              trailing={
                <PressScale
                  widthClass="narrow"
                  accessibilityLabel={moreLabel}
                  onPress={props.onMore}
                  testID={`plan-idea-handle-${ideaId}`}
                >
                  <Text variant="label" color={theme.semantic.text.secondary}>
                    {HANDLE}
                  </Text>
                </PressScale>
              }
            />
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}
