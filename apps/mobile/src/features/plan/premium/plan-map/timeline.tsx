/**
 * The day's timeline inside the half sheet (4.26): each stop as a card beside its time, the leg to
 * the next one between them. Holding a stop lifts it (tilted, scaled, shadow deepened) and it
 * follows the finger; the slot it would land in opens dashed, with the time it would start at,
 * and the map redraws the order live. A booked or pinned stop refuses to lift and says why; a hold
 * that never moves opens the stop's menu, as a tap does. Under Reduce Motion the lift is a fade.
 */
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  Icon,
  makePremiumStyles,
  PressableScale,
  REDUCED_FADE,
  SPRINGS,
  StatusTag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { dayColours } from '../map';

export interface TimelineRow {
  readonly id: string;
  readonly n: number;
  readonly time: string;
  readonly title: string;
  readonly meta: string | null;
  readonly booked: boolean;
  /** The leg to the next stop ("Walk · 6 min"). */
  readonly legAfter: string | null;
}

export interface TimelineProps {
  readonly dayNo: number;
  /** Rows in the order shown (the drag's preview while a stop is held). */
  readonly rows: readonly TimelineRow[];
  /** The held stop's id, and the time it would start at in its new place. */
  readonly lifted: { readonly id: string; readonly time: string | null } | null;
  readonly labels: { readonly booked: string; readonly menu: string; readonly drop: string };
  /** Lift the stop at `index` (of the plan's order); false when it refuses. */
  readonly onLift: ((index: number) => boolean) | null;
  readonly onCross: (index: number) => void;
  readonly onDrop: () => void;
  readonly onCancel: () => void;
  readonly onOpenMenu: (id: string) => void;
}

const HOLD_MS = 350;
/** The leg rail sits under the stop's number disc: past the time column, the gap and the card. */
const RAIL_INSET = 24;

/** The time column: 44 pt holds a 24-hour clock ("14:30"); a 12-hour one ("10:40am") needs 62. */
function clockWidth(times: readonly (string | null | undefined)[]): number {
  return times.some((time) => (time?.length ?? 0) > 5) ? 62 : 44;
}

const useStyles = makePremiumStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.gap8 },
  time: { paddingTop: 12, alignItems: 'flex-end' },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap10,
    backgroundColor: t.color.card,
    borderRadius: t.radius.field,
    paddingVertical: t.space.rowPadV,
    paddingHorizontal: t.space.gap12,
    boxShadow: t.shadow.card,
  },
  disc: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.color.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  leg: { flexDirection: 'row', alignItems: 'center', height: 26, gap: 8 },
  legLine: { width: 2, height: 26, backgroundColor: t.color.progressTodo },
  slot: {
    flex: 1,
    height: 56,
    borderRadius: t.radius.field,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.color.caret,
  },
}));

function StopCard({
  row,
  dayNo,
  labels,
  onOpenMenu,
}: {
  readonly row: TimelineRow;
  readonly dayNo: number;
  readonly labels: TimelineProps['labels'];
  readonly onOpenMenu: (id: string) => void;
}) {
  const styles = useStyles();
  const t = usePremiumTheme();
  return (
    <View style={styles.card}>
      <View style={[styles.disc, { backgroundColor: dayColours(dayNo).fill }]}>
        <Text variant="tier" tone="onAccent">
          {String(row.n)}
        </Text>
      </View>
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1}>
          {row.title}
        </Text>
        {row.meta === null ? null : (
          <Text variant="captionMuted" tone="muted" numberOfLines={1}>
            {row.meta}
          </Text>
        )}
      </View>
      {row.booked ? <StatusTag label={labels.booked} tone="booked" /> : null}
      <PressableScale
        onPress={() => onOpenMenu(row.id)}
        accessibilityRole="button"
        accessibilityLabel={labels.menu}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        testID={`stop-menu-${row.id}`}
      >
        <Icon name="more" size={18} color={t.color.muted} />
      </PressableScale>
    </View>
  );
}

export function Timeline(props: TimelineProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  // Where each row sits, by index, as laid out (read by the drag, never by render).
  const layouts = useSharedValue<Readonly<Record<number, { y: number; h: number }>>>({});
  const [held, setHeld] = useState<{ index: number; startY: number } | null>(null);
  const dy = useSharedValue(0);
  const lift = useSharedValue(0);
  const order = props.rows.map((row) => row.id);
  const clock = clockWidth([...props.rows.map((row) => row.time), props.lifted?.time]);

  const begin = (index: number) => {
    if (props.onLift === null) return;
    if (!props.onLift(index)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setHeld({ index, startY: layouts.get()[index]?.y ?? 0 });
    lift.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.snappy));
  };
  const move = (translation: number) => {
    if (held === null) return;
    const centre = held.startY + translation + (layouts.get()[held.index]?.h ?? 0) / 2;
    let over = 0;
    for (const [key, layout] of Object.entries(layouts.get())) {
      const index = Number(key);
      if (centre > layout.y + layout.h / 2 || index === 0) over = Math.max(over, index);
    }
    props.onCross(over);
  };
  const end = (moved: boolean) => {
    const was = held;
    setHeld(null);
    lift.set(reduced ? withTiming(0, REDUCED_FADE) : withSpring(0, SPRINGS.smooth));
    dy.set(0);
    if (was === null) return;
    if (!moved) {
      props.onCancel();
      const id = order[was.index];
      if (id !== undefined) props.onOpenMenu(id);
      return;
    }
    void Haptics.selectionAsync();
    props.onDrop();
  };

  const gestureFor = (index: number) =>
    Gesture.Pan()
      .enabled(props.onLift !== null)
      .activateAfterLongPress(HOLD_MS)
      .onStart(() => {
        'worklet';
        scheduleOnRN(begin, index);
      })
      .onUpdate((event) => {
        'worklet';
        dy.set(event.translationY);
        scheduleOnRN(move, event.translationY);
      })
      .onEnd((event) => {
        'worklet';
        scheduleOnRN(end, Math.abs(event.translationY) > 8);
      });

  const floating = useAnimatedStyle(() => ({
    transform: [
      { translateY: dy.value },
      { translateX: 6 * lift.value },
      { rotate: `${String(-1.5 * lift.value)}deg` },
      { scale: 1 + 0.03 * lift.value },
    ],
  }));
  const heldRow = held === null ? null : props.rows.find((row) => row.id === props.lifted?.id);

  return (
    <View>
      {props.rows.map((row, index) => {
        const isHeld = props.lifted?.id === row.id;
        return (
          <View
            key={row.id}
            onLayout={(event: LayoutChangeEvent) => {
              const { y, height } = event.nativeEvent.layout;
              layouts.set({ ...layouts.get(), [index]: { y, h: height } });
            }}
          >
            <View style={styles.row}>
              <View style={[styles.time, { width: clock }]}>
                <Text
                  variant="bannerAction"
                  color={isHeld ? t.color.caret : undefined}
                  numberOfLines={1}
                  singleLine
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {isHeld ? (props.lifted?.time ?? row.time) : row.time}
                </Text>
              </View>
              {isHeld ? (
                <View style={styles.slot} accessibilityLabel={props.labels.drop} />
              ) : (
                <GestureDetector gesture={gestureFor(index)}>
                  <PressableScale
                    onPress={() => props.onOpenMenu(row.id)}
                    accessibilityRole="button"
                    accessibilityLabel={row.title}
                    style={{ flex: 1 }}
                    testID={`timeline-stop-${row.id}`}
                  >
                    <StopCard
                      row={row}
                      dayNo={props.dayNo}
                      labels={props.labels}
                      onOpenMenu={props.onOpenMenu}
                    />
                  </PressableScale>
                </GestureDetector>
              )}
            </View>
            {row.legAfter === null || index === props.rows.length - 1 ? null : (
              <View style={[styles.leg, { paddingStart: clock + RAIL_INSET }]}>
                <View style={styles.legLine} />
                <Text variant="badge" tone="muted">
                  {row.legAfter}
                </Text>
              </View>
            )}
          </View>
        );
      })}
      {held === null || heldRow == null ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 52,
              right: 0,
              top: held.startY,
              boxShadow: t.shadow.float,
            },
            floating,
          ]}
        >
          <StopCard row={heldRow} dayNo={props.dayNo} labels={props.labels} onOpenMenu={() => {}} />
        </Animated.View>
      )}
    </View>
  );
}
