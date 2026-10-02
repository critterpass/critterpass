/**
 * One block on the timeline (3e-2): r16 in its category colour, uppercase title and a meta line,
 * springing (soft) to wherever the layout puts it, so a reflow or a remote edit glides. Long-press
 * lifts it to drag, the top and bottom edges resize it, a tap opens the item. Screen readers get
 * the same moves as actions: 15 minutes earlier or later, extend or shorten by 15, next lane.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, useState } from 'react';
import type { AccessibilityActionEvent } from 'react-native';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';

import { bezierEasing, isPhysicalSpring, springConfig } from '@/motion';
import { useLocale } from '@/lib/i18n/use-locale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clockRange } from '../day/format';
import { GHOST_ACCEPT } from './guide-ghost';
import { useTimelineDrag, type TimelineDragOptions } from './use-timeline-drag';

const SOFT = isPhysicalSpring(tokens.motion.spring.soft)
  ? springConfig(tokens.motion.spring.soft)
  : undefined;
/** Blocks shorter than this show the title only. */
const META_MIN_HEIGHT = 40;
const HANDLE_HEIGHT = 12;
/** The frame's and the face's vertical padding (theme space 2 and 8; 4 when tightened). */
const FRAME_PAD = 2;
const FACE_PAD = 8;
const FACE_PAD_TIGHT = 4;

export interface TimelineBlockModel {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly color: string;
  readonly start: number;
  readonly end: number;
  /** Booked or fixed: never dragged, a push into it is refused. */
  readonly fixed: boolean;
  /** Queued offline, or waiting on the crew's yes. */
  readonly pending: boolean;
}

export interface BlockFrame {
  readonly top: number;
  readonly height: number;
  readonly left: number;
  readonly width: number;
}

export type BlockHandlers = Pick<
  TimelineDragOptions,
  'onLift' | 'onSlot' | 'onDrop' | 'onResize' | 'onResizeEnd' | 'onOpen'
> & {
  readonly onStep: (minutes: number) => void;
  readonly onResizeStep: (minutes: number) => void;
  readonly onNextLane: () => void;
};

const useStyles = makeStyles((th) => ({
  frame: { position: 'absolute', padding: th.space['2'] },
  face: {
    flex: 1,
    borderRadius: th.radius.md + th.space['2'],
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['8'],
    overflow: 'hidden',
    shadowColor: th.color.ink[950],
    shadowOffset: { width: 0, height: th.space['8'] },
    shadowRadius: th.space['16'],
  },
  pending: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.text.onAccent,
  },
  struck: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  strike: { textDecorationLine: 'line-through' },
  handle: { position: 'absolute', start: 0, end: 0, height: HANDLE_HEIGHT },
}));

const ACCEPT_EASING = bezierEasing(GHOST_ACCEPT.bezier);

/** Glides to each new place: the soft spring, or the ghost-accept curve while accepting. */
function useSpringTo(value: number, reduced: boolean, accepting: boolean) {
  const shared = useSharedValue(value);
  useEffect(() => {
    if (reduced || SOFT === undefined) shared.value = value;
    else if (accepting) {
      shared.value = withTiming(value, {
        duration: GHOST_ACCEPT.durationMs,
        easing: ACCEPT_EASING,
      });
    } else shared.value = withSpring(value, SOFT);
  }, [shared, value, reduced, accepting]);
  return shared;
}

export function TimelineBlock({
  block,
  frame,
  drag,
  handlers,
  editable,
  shakeToken,
  lifted = false,
  struck = false,
  accepting = false,
}: {
  readonly block: TimelineBlockModel;
  readonly frame: BlockFrame;
  readonly drag: Omit<
    TimelineDragOptions,
    keyof BlockHandlers | 'start' | 'end' | 'movable' | 'resizable' | 'lifted'
  >;
  readonly lifted?: boolean;
  /** The guide suggests moving it: dashed and struck through where it is now. */
  readonly struck?: boolean;
  /** Gliding into the accepted ghost's place. */
  readonly accepting?: boolean;
  readonly handlers: BlockHandlers;
  readonly editable: boolean;
  /** Changes when a drop of this block is refused: it shakes once. */
  readonly shakeToken: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const top = useSpringTo(frame.top, drag.reduced, accepting);
  const left = useSpringTo(frame.left, drag.reduced, accepting);
  const width = useSpringTo(frame.width, drag.reduced, accepting);
  const height = useSpringTo(frame.height, drag.reduced, accepting);
  const gestures = useTimelineDrag({
    ...drag,
    ...handlers,
    start: block.start,
    end: block.end,
    movable: editable && !block.fixed,
    resizable: editable && !block.fixed,
    lifted,
  });
  const shaken = useRef(shakeToken);
  const { rejectShake } = gestures;
  useEffect(() => {
    if (shakeToken === shaken.current) return;
    shaken.current = shakeToken;
    rejectShake();
  }, [shakeToken, rejectShake]);
  const frameStyle = useAnimatedStyle(() => ({
    top: top.value,
    left: left.value,
    width: width.value,
    height: height.value,
  }));
  const range = clockRange(locale, block.start, block.end);
  const actions = editable
    ? [
        { name: 'activate' },
        ...(block.fixed
          ? []
          : [
              {
                name: 'increment',
                label: t({ id: 'plan.timeline.a11y.later', message: 'Move 15 minutes later' }),
              },
              {
                name: 'decrement',
                label: t({ id: 'plan.timeline.a11y.earlier', message: 'Move 15 minutes earlier' }),
              },
              {
                name: 'extend',
                label: t({ id: 'plan.timeline.a11y.extend', message: 'Extend by 15 minutes' }),
              },
              {
                name: 'shorten',
                label: t({ id: 'plan.timeline.a11y.shorten', message: 'Shorten by 15 minutes' }),
              },
              ...(drag.lanes > 1
                ? [
                    {
                      name: 'lane',
                      label: t({ id: 'plan.timeline.a11y.lane', message: 'Move to the next lane' }),
                    },
                  ]
                : []),
            ]),
      ]
    : [{ name: 'activate' }];
  const onAction = (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'activate':
        handlers.onOpen();
        break;
      case 'increment':
        handlers.onStep(15);
        break;
      case 'decrement':
        handlers.onStep(-15);
        break;
      case 'extend':
        handlers.onResizeStep(15);
        break;
      case 'shorten':
        handlers.onResizeStep(-15);
        break;
      case 'lane':
        handlers.onNextLane();
        break;
    }
  };
  // The words must fit the block at its height. When a language's lines run taller (stacked
  // marks) the face first tightens its padding; only if the meta line still would be cut is it
  // left out, never drawn in half.
  const [fit, setFit] = useState<{ key: string; step: 1 | 2 } | null>(null);
  const fitKey = `${frame.height}|${block.meta}|${block.title}`;
  const step = fit?.key === fitKey ? fit.step : 0;
  const showMeta = frame.height >= META_MIN_HEIGHT && block.meta !== '' && step < 2;
  const padding = step === 0 ? FACE_PAD : FACE_PAD_TIGHT;
  // The face clips at its border, not its padding: words may run into the far side's padding.
  const inner = frame.height - FRAME_PAD * 2 - padding;
  return (
    <GestureDetector gesture={gestures.drag}>
      <Animated.View
        testID={`timeline-block-${block.id}`}
        accessible
        accessibilityRole={editable && !block.fixed ? 'adjustable' : 'button'}
        accessibilityLabel={[block.title, block.meta].filter(Boolean).join(', ')}
        accessibilityValue={{ text: range }}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        style={[styles.frame, frameStyle, gestures.liftStyle]}
      >
        <GestureDetector gesture={gestures.tap}>
          <View
            style={[
              styles.face,
              { paddingVertical: padding },
              struck ? styles.struck : { backgroundColor: block.color },
              block.pending && !struck ? styles.pending : null,
            ]}
          >
            <View
              onLayout={(event) => {
                if (showMeta && event.nativeEvent.layout.height > inner + 0.5) {
                  setFit({ key: fitKey, step: step === 0 ? 1 : 2 });
                }
              }}
            >
              <Text
                variant="title"
                color={struck ? theme.semantic.text.secondary : theme.semantic.text.onAccent}
                style={struck ? styles.strike : null}
                numberOfLines={1}
              >
                {upper(block.title, locale)}
              </Text>
              {showMeta ? (
                <Text
                  variant="bodySm"
                  color={struck ? theme.semantic.text.secondary : theme.semantic.text.onAccent}
                  style={struck ? styles.strike : null}
                  numberOfLines={1}
                >
                  {block.meta}
                </Text>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        {editable && !block.fixed ? (
          <>
            <GestureDetector gesture={gestures.topHandle}>
              <View style={[styles.handle, { top: 0 }]} testID={`timeline-block-${block.id}-top`} />
            </GestureDetector>
            <GestureDetector gesture={gestures.bottomHandle}>
              <View
                style={[styles.handle, { bottom: 0 }]}
                testID={`timeline-block-${block.id}-bottom`}
              ></View>
            </GestureDetector>
          </>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
