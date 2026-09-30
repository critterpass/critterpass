/**
 * The overview's day list (3e-1). Long-press lifts a day, dragging moves the others out of the way
 * with a spring (a tick per slot crossed), and dropping commits the new order; screen readers get
 * "Move up" / "Move down" actions instead. Rows are keyed by the plan they hold, so a reorder that
 * arrives from someone else re-sorts with the same spring. Past days of a trip under way fold into
 * one row.
 */
import { plural, t } from '@lingui/core/macro';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AccessibilityActionEvent } from 'react-native';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { useLocale } from '@/lib/i18n/use-locale';
import { isPhysicalSpring, springConfig } from '@/motion/easing';
import { impact } from '@/motion/feedback';
import { usePress } from '@/motion/gestures/press';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { makeStyles } from '@/ui/theme';

import { DAY_CARD_GAP, DAY_CARD_HEIGHT, DayCard, dayCardLabel } from './day-card';
import { rowKeys, type DayCard as DayCardModel } from './model/plan-model';

const PITCH = DAY_CARD_HEIGHT + DAY_CARD_GAP;
const LIFT_MS = 320;
const spring = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;

export type DropResult = 'moved' | 'refused';

export interface DayListProps {
  readonly cards: readonly DayCardModel[];
  readonly canReorder: boolean;
  readonly sweepDays: ReadonlySet<number>;
  readonly onSwept: () => void;
  /** Day number → shake counter (a booked day refused to move). */
  readonly shakes: ReadonlyMap<number, number>;
  readonly onOpen: (card: DayCardModel) => void;
  /** Indexes into `cards`; the parent refuses a move that would shift a booked day. */
  readonly onReorder: (from: number, to: number) => DropResult;
  /** A day is lifted (the page stops scrolling) or let go. */
  readonly onDragging?: (dragging: boolean) => void;
}

const useStyles = makeStyles((th) => ({
  list: { gap: DAY_CARD_GAP },
  past: { alignSelf: 'flex-start', paddingVertical: th.space['4'] },
}));

interface DragState {
  readonly active: SharedValue<number>;
  readonly hover: SharedValue<number>;
  readonly dragY: SharedValue<number>;
  /** Worklet: lifts row `index`. */
  readonly begin: (index: number) => void;
  /** Worklet: follows the finger; true when the drop slot changed (a tick). */
  readonly follow: (index: number, translationY: number, count: number) => boolean;
  /** Worklet: glides the lifted row to its slot and returns it (-1 when not lifted). */
  readonly end: (index: number) => number;
  /** Springs a refused or unmoved drop back to `from`, then lets go. */
  readonly release: (from: number) => void;
  /** Lets go at once (the rows have re-rendered in their new order). */
  readonly reset: () => void;
}

/** The list's one drag: which row is lifted, the slot it would drop into, and its offset. */
function useDragState(): DragState {
  const active = useSharedValue(-1);
  const hover = useSharedValue(-1);
  const dragY = useSharedValue(0);
  return {
    active,
    hover,
    dragY,
    begin: (index) => {
      'worklet';
      active.value = index;
      hover.value = index;
      dragY.value = 0;
    },
    follow: (index, translationY, count) => {
      'worklet';
      if (active.value !== index) return false;
      dragY.value = translationY;
      const next = Math.min(count - 1, Math.max(0, index + Math.round(translationY / PITCH)));
      if (next === hover.value) return false;
      hover.value = next;
      return true;
    },
    end: (index) => {
      'worklet';
      if (active.value !== index) return -1;
      const to = hover.value;
      dragY.value = withSpring((to - index) * PITCH, spring);
      return to;
    },
    release: (from) => {
      hover.value = from;
      dragY.value = withSpring(0, spring, (done) => {
        if (done) {
          active.value = -1;
          hover.value = -1;
        }
      });
    },
    reset: () => {
      active.value = -1;
      hover.value = -1;
      dragY.value = 0;
    },
  };
}

function DraggableDay({
  card,
  index,
  count,
  drag,
  props,
  localDrop,
}: {
  readonly card: DayCardModel;
  readonly index: number;
  readonly count: number;
  readonly drag: DragState;
  readonly props: DayListProps;
  /** True while my own drop is re-rendering (rows are already in place, nothing slides). */
  readonly localDrop: { readonly current: boolean };
}) {
  const locale = useLocale();
  const previous = useRef(index);
  const resort = useSharedValue(0);
  useLayoutEffect(() => {
    if (previous.current !== index && !localDrop.current) {
      resort.value = (previous.current - index) * PITCH;
      resort.value = withSpring(0, spring);
    }
    previous.current = index;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resort is a stable shared value ref.
  }, [index]);
  const { active, hover, dragY } = drag;
  const label = dayCardLabel(card, locale);
  const press = usePress({
    widthClass: 'wide',
    onPress: () => props.onOpen(card),
    accessibilityLabel: label,
  });

  const lift = () => {
    impact('peel');
    props.onDragging?.(true);
  };
  const tick = () => impact('tick');
  const drop = (from: number, to: number) => {
    props.onDragging?.(false);
    if (from === to) {
      drag.release(from);
      return;
    }
    if (props.onReorder(from, to) === 'refused') {
      impact('error');
      drag.release(from);
      return;
    }
    impact('snap');
  };
  const { begin, follow, end } = drag;

  const pan = Gesture.Pan()
    .enabled(props.canReorder)
    .activateAfterLongPress(LIFT_MS)
    .onStart(() => {
      'worklet';
      begin(index);
      scheduleOnRN(lift);
    })
    .onUpdate((event) => {
      'worklet';
      if (follow(index, event.translationY, count)) scheduleOnRN(tick);
    })
    .onEnd(() => {
      'worklet';
      const to = end(index);
      if (to >= 0) scheduleOnRN(drop, index, to);
    });

  const style = useAnimatedStyle(() => {
    const lifted = active.value;
    if (lifted < 0) return { transform: [{ translateY: resort.value }, { scale: 1 }], zIndex: 0 };
    if (lifted === index) {
      return { transform: [{ translateY: dragY.value }, { scale: 1.03 }], zIndex: 10 };
    }
    const target = hover.value;
    const shift =
      lifted < index && index <= target ? -PITCH : target <= index && index < lifted ? PITCH : 0;
    return { transform: [{ translateY: withSpring(shift, spring) }, { scale: 1 }], zIndex: 0 };
  });

  const actions = [
    { name: 'activate', label },
    ...(props.canReorder
      ? [
          { name: 'moveUp', label: t({ id: 'plan.overview.moveUp', message: 'Move up' }) },
          { name: 'moveDown', label: t({ id: 'plan.overview.moveDown', message: 'Move down' }) },
        ]
      : []),
  ];
  const onAction = (event: AccessibilityActionEvent) => {
    const name = event.nativeEvent.actionName;
    if (name === 'activate') props.onOpen(card);
    if (name === 'moveUp' && index > 0) props.onReorder(index, index - 1);
    if (name === 'moveDown' && index < count - 1) props.onReorder(index, index + 1);
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={style}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
      >
        <GestureDetector gesture={press.gesture}>
          <Animated.View style={press.animatedStyle}>
            <DayCard
              card={card}
              sweep={props.sweepDays.has(card.dayNo)}
              onSwept={props.onSwept}
              shake={props.shakes.get(card.dayNo) ?? 0}
            />
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </GestureDetector>
  );
}

export function DayList(props: DayListProps) {
  const styles = useStyles();
  const drag = useDragState();
  const [showPast, setShowPast] = useState(false);
  const pastCount = props.cards.filter((card) => card.when === 'past').length;
  const keys = useMemo(() => rowKeys(props.cards), [props.cards]);
  const order = keys.join('|');

  // A committed drop re-renders the rows in their new places; only then does the lift let go, so
  // the dragged card never jumps back for a frame.
  const { reset } = drag;
  // A drop of mine re-renders rows already where they belong; anything else slides them there.
  const localDrop = useRef(false);
  useLayoutEffect(() => {
    reset();
    localDrop.current = false;
  }, [order, reset]);
  const listProps: DayListProps = {
    ...props,
    onReorder: (from, to) => {
      const result = props.onReorder(from, to);
      if (result === 'moved') localDrop.current = true;
      return result;
    },
  };

  const count = props.cards.length;
  return (
    <View style={styles.list} testID="plan-day-list">
      {pastCount > 0 ? (
        <View style={styles.past}>
          <InlineAction
            label={
              showPast
                ? t({ id: 'plan.overview.hidePast', message: 'Hide past days' })
                : t({
                    id: 'plan.overview.showPast',
                    message: plural(pastCount, { one: '# past day', other: '# past days' }),
                  })
            }
            onPress={() => setShowPast((shown) => !shown)}
            testID="plan-past-toggle"
          />
        </View>
      ) : null}
      {props.cards.map((card, index) =>
        card.when === 'past' && !showPast ? null : (
          <DraggableDay
            key={keys[index]}
            card={card}
            index={index}
            count={count}
            drag={drag}
            props={listProps}
            localDrop={localDrop}
          />
        ),
      )}
    </View>
  );
}
