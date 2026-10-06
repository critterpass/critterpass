/**
 * The day plan's timeline (7b-1): the day's stops with their legs, free time and the guide's notes
 * under the stops an issue names. Long-press lifts a stop and dragging moves the others out of the
 * way (a tick per stop crossed, the mini-map redrawing the order); letting go hands the order to
 * the reorder, which times the day again or refuses with a reason (the stop springs back). Screen
 * readers get Move up and Move down instead.
 */
import { useLingui } from '@lingui/react/macro';
import { useLayoutEffect } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { isPhysicalSpring, springConfig } from '@/motion/easing';
import { impact } from '@/motion/feedback';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { DayItem } from '@/data/plan/plan-model';

import { MineList, StayEdge, StopBlock, type StopListContext } from '../trip-map/stop-list';
import type { StayRows, StopRow } from '../trip-map/stop-rows';

const LIFT_MS = 320;
const spring = isPhysicalSpring(tokens.motion.spring.snappy)
  ? springConfig(tokens.motion.spring.snappy)
  : undefined;

const useStyles = makeStyles((t) => ({
  list: { gap: t.space['4'] },
  travel: { paddingVertical: t.space['8'], paddingHorizontal: t.space['4'] },
}));

/** The link between the stay's city and the day's area, as a quiet line at an edge of the day. */
export function TravelEdge({ line, testID }: { readonly line: string; readonly testID: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.travel} testID={testID}>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {line}
      </Text>
    </View>
  );
}

export interface TimelineDrag {
  /** True when the stop may be lifted; false refuses (the caller says why). */
  readonly onLift: (index: number) => boolean;
  readonly onCross: (index: number) => void;
  /** Settles the drop; resolves true when the order changed. */
  readonly onDrop: () => Promise<boolean>;
}

interface Shared {
  readonly active: SharedValue<number>;
  readonly hover: SharedValue<number>;
  readonly dragY: SharedValue<number>;
  readonly heights: SharedValue<number[]>;
  /** Worklet: lifts block `index`. */
  readonly begin: (index: number) => void;
  /** Worklet: follows the finger; the new drop slot, or -1 when it didn't change. */
  readonly follow: (index: number, dy: number) => number;
  /** Springs the lifted block back to where it was, then lets go. */
  readonly release: () => void;
  /** Lets go at once (a refused lift, or the stops re-rendered in their new order). */
  readonly reset: () => void;
  readonly setHeight: (index: number, height: number) => void;
}

/** The timeline's one drag: which block is lifted, the slot it would drop into, its offset. */
function useShared(): Shared {
  const active = useSharedValue(-1);
  const hover = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);
  return {
    active,
    hover,
    dragY,
    heights,
    begin: (index) => {
      'worklet';
      active.value = index;
      hover.value = index;
      dragY.value = 0;
    },
    follow: (index, dy) => {
      'worklet';
      if (active.value !== index) return -1;
      dragY.value = dy;
      const to = hoverOf(heights.value, index, dy);
      if (to === hover.value) return -1;
      hover.value = to;
      return to;
    },
    release: () => {
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
    setHeight: (index, height) => {
      const next = [...heights.value];
      next[index] = height;
      heights.value = next;
    },
  };
}

/** The slot a block dragged by `dy` from `index` would drop into (by the blocks' midpoints). */
function hoverOf(heights: readonly number[], index: number, dy: number): number {
  'worklet';
  let to = index;
  let reach = 0;
  if (dy > 0) {
    for (let k = index + 1; k < heights.length; k += 1) {
      const h = heights[k] ?? 0;
      if (dy > reach + h / 2) to = k;
      else break;
      reach += h;
    }
  } else {
    for (let k = index - 1; k >= 0; k -= 1) {
      const h = heights[k] ?? 0;
      if (-dy > reach + h / 2) to = k;
      else break;
      reach += h;
    }
  }
  return to;
}

function Block({
  row,
  index,
  count,
  shared,
  drag,
  context,
}: {
  readonly row: StopRow;
  readonly index: number;
  readonly count: number;
  readonly shared: Shared;
  readonly drag: TimelineDrag | null;
  readonly context: StopListContext;
}) {
  const { t } = useLingui();
  const { active, hover, dragY, heights, begin, follow, release, reset, setHeight } = shared;
  const lift = () => {
    if (drag?.onLift(index) === true) {
      impact('peel');
      return;
    }
    impact('error');
    reset();
  };
  const cross = (to: number) => {
    impact('tick');
    drag?.onCross(to);
  };
  const drop = () => {
    void drag?.onDrop().then((moved) => {
      impact(moved ? 'snap' : 'error');
      if (!moved) release();
    });
  };
  const pan = Gesture.Pan()
    .enabled(drag !== null)
    .activateAfterLongPress(LIFT_MS)
    .onStart(() => {
      'worklet';
      begin(index);
      scheduleOnRN(lift);
    })
    .onUpdate((event) => {
      'worklet';
      const to = follow(index, event.translationY);
      if (to >= 0) scheduleOnRN(cross, to);
    })
    .onEnd(() => {
      'worklet';
      if (active.value !== index) return;
      scheduleOnRN(drop);
    });
  const style = useAnimatedStyle(() => {
    const lifted = active.value;
    if (lifted < 0) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };
    if (lifted === index) {
      return { transform: [{ translateY: dragY.value }, { scale: 1.02 }], zIndex: 10 };
    }
    const pitch = heights.value[lifted] ?? 0;
    const target = hover.value;
    const shift =
      lifted < index && index <= target ? -pitch : target <= index && index < lifted ? pitch : 0;
    return { transform: [{ translateY: withSpring(shift, spring) }, { scale: 1 }], zIndex: 0 };
  });
  const up = t({ id: 'plan.dayPlan.moveUp', message: 'Move up' });
  const down = t({ id: 'plan.dayPlan.moveDown', message: 'Move down' });
  const actions =
    drag === null
      ? []
      : [
          ...(index > 0 ? [{ name: 'moveUp', label: up }] : []),
          ...(index < count - 1 ? [{ name: 'moveDown', label: down }] : []),
        ];
  const onAction = (event: AccessibilityActionEvent) => {
    if (drag === null) return;
    const to = event.nativeEvent.actionName === 'moveUp' ? index - 1 : index + 1;
    if (!drag.onLift(index)) return;
    drag.onCross(to);
    void drag.onDrop();
  };
  const block = (
    <Animated.View
      style={style}
      accessibilityActions={actions}
      onAccessibilityAction={onAction}
      onLayout={(event) => setHeight(index, event.nativeEvent.layout.height)}
    >
      <StopBlock row={row} context={context} />
    </Animated.View>
  );
  // A day nobody can reorder has no hold-and-drag at all: a switched-off gesture around the row
  // must never stand between a tap and the stop it opens.
  return drag === null ? block : <GestureDetector gesture={pan}>{block}</GestureDetector>;
}

export function StopTimeline({
  rows,
  context,
  drag,
  stay,
  mine,
  travel,
}: {
  readonly rows: readonly StopRow[];
  readonly context: StopListContext;
  readonly drag: TimelineDrag | null;
  /** When to leave the stay and when the day is back at it. */
  readonly stay?: StayRows | undefined;
  /** The stops only I have on the day, listed under the crew's. */
  readonly mine?: readonly { readonly time: string; readonly stop: DayItem }[] | undefined;
  /** A day trip's way there and back ("about 3 h 30 by train each way"): opens and ends the day. */
  readonly travel?: string | undefined;
}) {
  const styles = useStyles();
  const shared = useShared();
  const order = rows.map((row) => row.stop.stableId).join('|');
  const { reset } = shared;
  // A new order (my drop, or someone else's) lands with every stop already in its place.
  useLayoutEffect(() => {
    reset();
    // `reset` only touches shared values; the order is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);
  return (
    <View style={styles.list} testID="day-plan-timeline">
      {travel === undefined ? null : <TravelEdge line={travel} testID="day-plan-travel-out" />}
      {stay?.leave == null ? null : <StayEdge kind="leave" edge={stay.leave} />}
      {rows.map((row, index) => (
        <Block
          key={row.stop.stableId}
          row={row}
          index={index}
          count={rows.length}
          shared={shared}
          drag={drag}
          context={context}
        />
      ))}
      {stay?.back == null ? null : <StayEdge kind="back" edge={stay.back} />}
      {travel === undefined ? null : <TravelEdge line={travel} testID="day-plan-travel-back" />}
      <MineList rows={mine ?? []} />
    </View>
  );
}
