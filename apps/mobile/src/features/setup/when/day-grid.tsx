/**
 * A Monday-first month of day cells shared by the dates heatmap and marking days by hand: the
 * weekday letters, one row of seven flexible slots per week, and behind the cells a continuous
 * band per week row (rounded only on a range's first and last day) or, over them, a ghost
 * outline. Hold a day and drag to sweep across days; a quick sideways swipe turns the month.
 * Taps and screen readers go through each day's own button, which the caller renders.
 */
import { useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { impact } from '@/motion';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { DayRange } from './range';

const COLUMNS = 7;
/** How long a day is held before a drag starts sweeping (a shorter hold is a tap or a swipe). */
const HOLD_MS = 220;
/** Sideways travel (pt) or speed (pt/s) that turns the month. */
const SWIPE_PT = 48;
const SWIPE_SPEED = 600;

export interface BandEdges {
  readonly first: boolean;
  readonly last: boolean;
}

export interface DayBands {
  readonly fill: BandEdges | null;
  readonly ghost: BandEdges | null;
}

/** Where `date` sits in `range`, or null outside it. */
export function edgesIn(range: DayRange | null, date: string): BandEdges | null {
  if (range === null || date < range.start || date > range.end) return null;
  return { first: date === range.start, last: date === range.end };
}

export interface DragHandlers {
  readonly begin: (date: string) => void;
  readonly move: (date: string) => void;
  readonly end: () => void;
}

export interface DayGridProps {
  readonly weekdays: readonly string[];
  /** Weeks of seven dates (`YYYY-MM-DD`), blanks as null. */
  readonly weeks: readonly (readonly (string | null)[])[];
  readonly renderDay: (date: string) => ReactNode;
  readonly bands?: ((date: string) => DayBands) | undefined;
  readonly onDrag?: DragHandlers | undefined;
  /** 1 for the next month, -1 for the previous. */
  readonly onSwipe?: ((step: 1 | -1) => void) | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((th) => ({
  week: { flexDirection: 'row' },
  slot: { flex: 1, padding: th.space['2'] },
  weekday: { alignItems: 'center', paddingBottom: th.space['2'] },
  band: { position: 'absolute', top: th.space['2'], bottom: th.space['2'], start: 0, end: 0 },
  first: {
    start: th.space['2'],
    borderTopStartRadius: th.radius.sm,
    borderBottomStartRadius: th.radius.sm,
  },
  last: {
    end: th.space['2'],
    borderTopEndRadius: th.radius.sm,
    borderBottomEndRadius: th.radius.sm,
  },
  ghost: { borderTopWidth: th.space['2'], borderBottomWidth: th.space['2'] },
  ghostFirst: { borderStartWidth: th.space['2'] },
  ghostLast: { borderEndWidth: th.space['2'] },
}));

export function DayGrid({
  weekdays,
  weeks,
  renderDay,
  bands,
  onDrag,
  onSwipe,
  testID,
}: DayGridProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const last = useRef<string | null>(null);
  const shift = useSharedValue(0);
  const yellow = theme.semantic.action.primary;

  const dateAt = (x: number, y: number): string | null => {
    if (size.width <= 0 || size.height <= 0 || weeks.length === 0) return null;
    const row = Math.min(
      weeks.length - 1,
      Math.max(0, Math.floor(y / (size.height / weeks.length))),
    );
    const column = Math.min(COLUMNS - 1, Math.max(0, Math.floor(x / (size.width / COLUMNS))));
    return weeks[row]?.[column] ?? null;
  };
  const begin = (x: number, y: number) => {
    const date = dateAt(x, y);
    last.current = date;
    if (date === null || onDrag === undefined) return;
    impact('tick');
    onDrag.begin(date);
  };
  const move = (x: number, y: number) => {
    const date = dateAt(x, y);
    if (date === null || date === last.current || onDrag === undefined) return;
    last.current = date;
    impact('tick');
    onDrag.move(date);
  };
  const end = () => {
    if (last.current !== null) onDrag?.end();
    last.current = null;
  };
  const swipe = (step: 1 | -1) => onSwipe?.(step);

  const drag = Gesture.Pan()
    .enabled(onDrag !== undefined && size.width > 0)
    .activateAfterLongPress(HOLD_MS)
    .onStart((event) => {
      'worklet';
      scheduleOnRN(begin, event.x, event.y);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(move, event.x, event.y);
    })
    .onEnd(() => {
      'worklet';
      scheduleOnRN(end);
    });
  const turn = Gesture.Pan()
    .enabled(onSwipe !== undefined)
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      'worklet';
      shift.value = event.translationX / 3;
    })
    .onEnd((event) => {
      'worklet';
      shift.value = withTiming(0, { duration: tokens.motion.duration.fast });
      const far = Math.abs(event.translationX) >= SWIPE_PT;
      const fast = Math.abs(event.velocityX) >= SWIPE_SPEED;
      if (far || fast) scheduleOnRN(swipe, event.translationX < 0 ? 1 : -1);
    });
  const shiftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  return (
    <View>
      <View style={styles.week} importantForAccessibility="no-hide-descendants">
        {weekdays.map((letter, column) => (
          <View key={`w${column}`} style={[styles.slot, styles.weekday]}>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {letter}
            </Text>
          </View>
        ))}
      </View>
      <GestureDetector gesture={Gesture.Race(drag, turn)}>
        <Animated.View
          style={shiftStyle}
          testID={testID}
          onLayout={(event: LayoutChangeEvent) =>
            setSize({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            })
          }
        >
          {weeks.map((week, row) => (
            <View key={`r${row}`} style={styles.week}>
              {week.map((date, column) => {
                if (date === null) return <View key={`b${row}-${column}`} style={styles.slot} />;
                const band = bands?.(date) ?? { fill: null, ghost: null };
                return (
                  <View key={date} style={styles.slot}>
                    {band.fill === null ? null : (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.band,
                          band.fill.first ? styles.first : null,
                          band.fill.last ? styles.last : null,
                          { backgroundColor: yellow },
                        ]}
                      />
                    )}
                    {renderDay(date)}
                    {band.ghost === null ? null : (
                      <View
                        pointerEvents="none"
                        style={[
                          styles.band,
                          styles.ghost,
                          band.ghost.first ? [styles.first, styles.ghostFirst] : null,
                          band.ghost.last ? [styles.last, styles.ghostLast] : null,
                          { borderColor: yellow },
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** A month as Monday-first weeks of seven dates, blanks as null. */
export function weeksOfDates(leadingBlanks: number, dates: readonly string[]): (string | null)[][] {
  const cells: (string | null)[] = [...Array.from({ length: leadingBlanks }, () => null), ...dates];
  while (cells.length % COLUMNS !== 0) cells.push(null);
  return Array.from({ length: cells.length / COLUMNS }, (_, row) =>
    cells.slice(row * COLUMNS, row * COLUMNS + COLUMNS),
  );
}
