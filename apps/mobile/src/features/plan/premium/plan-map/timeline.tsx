/**
 * The day's timeline inside the half sheet (4.26): each stop as a card beside its time, the leg to
 * the next one between them. Holding a stop lifts it (tilted, scaled, shadow deepened) and it
 * follows the finger; the slot it would land in opens dashed, with the time it would start at,
 * and the map redraws the order live. A booked or pinned stop refuses to lift and says why; a hold
 * that never moves opens the stop's menu, as a tap does. Under Reduce Motion the lift is a fade.
 */
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  makePremiumStyles,
  PressableScale,
  REDUCED_FADE,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { LiftRect } from './menu-choice';
import { StopCard, type StopCardLabels, type TimelineRow } from './timeline-stop-card';

export type { TimelineRow } from './timeline-stop-card';

export interface TimelineProps {
  readonly dayNo: number;
  /** Rows in the order shown (the drag's preview while a stop is held). */
  readonly rows: readonly TimelineRow[];
  /** The held stop's id, and the time it would start at in its new place. */
  readonly lifted: { readonly id: string; readonly time: string | null } | null;
  readonly labels: StopCardLabels & { readonly drop: string };
  /** Lift the stop at `index` (of the plan's order); false when it refuses. */
  readonly onLift: ((index: number) => boolean) | null;
  readonly onCross: (index: number) => void;
  readonly onDrop: () => void;
  readonly onCancel: () => void;
  /** Opens the stop's menu, lifted from where its card sits on screen (null when unmeasured). */
  readonly onOpenMenu: (id: string, from: LiftRect | null) => void;
}

const HOLD_MS = 350;
/** A row past the gestures made for this render (never drawn: the two lists share a length). */
const NO_DRAG = Gesture.Pan().enabled(false);
/** The leg rail sits under the stop's number disc: past the time column, the gap and the card. */
const RAIL_INSET = 24;

/**
 * The time column at the design's size: 44 pt holds a 24-hour clock ("14:30"), a 12-hour one
 * ("11:30am") 64. It grows with the reader's text size (up to the label's cap), so a long time is
 * never squeezed smaller than the rest.
 */
export function clockWidth(times: readonly (string | null | undefined)[], fontScale = 1): number {
  const base = times.some((time) => (time?.length ?? 0) > 5) ? 64 : 44;
  return Math.ceil(base * Math.min(Math.max(fontScale, 1), CLOCK_MAX_SCALE));
}

/** The time label's Dynamic Type cap (the control labels' 1.5). */
const CLOCK_MAX_SCALE = 1.5;
/** A figure space: as wide as one tabular digit. */
const FIGURE_SPACE = '\u2007';

/**
 * Pads a one-digit hour ("8:00am") with a figure space when the column also holds two-digit hours
 * ("11:30am"), so every time in the column lines up on both edges and at the colon.
 */
export function alignClock(time: string, times: readonly (string | null | undefined)[]): string {
  const hour = (value: string) => /^\d+/.exec(value)?.[0].length ?? 0;
  const widest = Math.max(0, ...times.map((value) => hour(value ?? '')));
  const own = hour(time);
  return own > 0 && own < widest ? FIGURE_SPACE.repeat(widest - own) + time : time;
}

const useStyles = makePremiumStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: t.space.gap8 },
  time: { paddingTop: 12, alignItems: 'flex-end' },
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

export function Timeline(props: TimelineProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const { fontScale } = useWindowDimensions();
  // Where each row sits, by index, as laid out (read by the drag, never by render).
  const layouts = useSharedValue<Readonly<Record<number, { y: number; h: number }>>>({});
  const [held, setHeld] = useState<{ index: number; startY: number } | null>(null);
  const dy = useSharedValue(0);
  const lift = useSharedValue(0);
  const order = useMemo(() => props.rows.map((row) => row.id), [props.rows]);
  const times = [...props.rows.map((row) => row.time), props.lifted?.time];
  const clock = clockWidth(times, fontScale);

  // The held row and the last slot it crossed, for the drag's worklet: crossing is worked out on
  // the UI thread and reaches React only when the slot changes.
  const heldIndex = useSharedValue(-1);
  const heldStart = useSharedValue(0);
  const lastOver = useSharedValue(-1);
  const { onLift, onCross, onCancel, onDrop } = props;
  // Each stop's card, so its menu lifts it from where it sits.
  const cards = useRef(new Map<string, ComponentRef<typeof View>>());
  const { onOpenMenu: openMenu } = props;
  const onOpenMenu = useCallback(
    (id: string) => {
      const card = cards.current.get(id);
      if (card === undefined) {
        openMenu(id, null);
        return;
      }
      card.measureInWindow((x, y, width, height) =>
        openMenu(id, width > 0 ? { x, y, width, height } : null),
      );
    },
    [openMenu],
  );

  const begin = useCallback(
    (index: number) => {
      if (onLift === null) return;
      if (!onLift(index)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const startY = layouts.get()[index]?.y ?? 0;
      heldStart.set(startY);
      lastOver.set(-1);
      heldIndex.set(index);
      setHeld({ index, startY });
      lift.set(reduced ? withTiming(1, REDUCED_FADE) : withSpring(1, SPRINGS.snappy));
    },
    [onLift, layouts, heldStart, lastOver, heldIndex, lift, reduced],
  );
  const end = useCallback(
    (moved: boolean) => {
      const was = held;
      heldIndex.set(-1);
      setHeld(null);
      lift.set(reduced ? withTiming(0, REDUCED_FADE) : withSpring(0, SPRINGS.smooth));
      dy.set(0);
      if (was === null) return;
      if (!moved) {
        onCancel();
        const id = order[was.index];
        if (id !== undefined) onOpenMenu(id);
        return;
      }
      void Haptics.selectionAsync();
      onDrop();
    },
    [held, heldIndex, lift, reduced, dy, onCancel, order, onOpenMenu, onDrop],
  );

  const enabled = onLift !== null;
  const count = props.rows.length;
  const gestures = useMemo(
    () =>
      Array.from({ length: count }, (_, index) =>
        Gesture.Pan()
          .enabled(enabled)
          .activateAfterLongPress(HOLD_MS)
          .onStart(() => {
            'worklet';
            scheduleOnRN(begin, index);
          })
          .onUpdate((event) => {
            'worklet';
            dy.set(event.translationY);
            const at = heldIndex.get();
            if (at < 0) return;
            const rows = layouts.get();
            const centre = heldStart.get() + event.translationY + (rows[at]?.h ?? 0) / 2;
            let over = 0;
            for (const key of Object.keys(rows)) {
              const i = Number(key);
              const layout = rows[i];
              if (layout === undefined) continue;
              if (centre > layout.y + layout.h / 2 || i === 0) over = Math.max(over, i);
            }
            if (over === lastOver.get()) return;
            lastOver.set(over);
            scheduleOnRN(onCross, over);
          })
          .onEnd((event) => {
            'worklet';
            scheduleOnRN(end, Math.abs(event.translationY) > 8);
          }),
      ),
    [count, enabled, begin, end, onCross, dy, heldIndex, heldStart, lastOver, layouts],
  );

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
            <View
              style={styles.row}
              ref={(view) => {
                if (view === null) cards.current.delete(row.id);
                else cards.current.set(row.id, view);
              }}
            >
              <View style={[styles.time, { width: clock }]}>
                <Text
                  variant="bannerAction"
                  color={isHeld ? t.color.caret : undefined}
                  numberOfLines={1}
                  singleLine
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {alignClock(isHeld ? (props.lifted?.time ?? row.time) : row.time, times)}
                </Text>
              </View>
              {isHeld ? (
                <View style={styles.slot} accessibilityLabel={props.labels.drop} />
              ) : (
                <GestureDetector gesture={gestures[index] ?? NO_DRAG}>
                  <PressableScale
                    onPress={() => onOpenMenu(row.id)}
                    accessibilityRole="button"
                    accessibilityLabel={row.title}
                    style={{ flex: 1 }}
                    testID={`timeline-stop-${row.id}`}
                  >
                    <StopCard
                      row={row}
                      dayNo={props.dayNo}
                      labels={props.labels}
                      onOpenMenu={onOpenMenu}
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
              left: clock + t.space.gap8,
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
