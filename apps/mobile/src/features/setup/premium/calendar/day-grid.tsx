/**
 * The calendar sheets' Monday-first month of day cells: one row of seven flexible slots per week.
 * Hold a day and drag to sweep across days; a quick sideways swipe turns the month. Taps and
 * screen readers go through each day's own button, which the caller renders.
 */
import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { impact } from '@/motion';
import { usePremiumTheme } from '@/ui/premium';

const COLUMNS = 7;
/** How long a day is held before a drag starts sweeping (a shorter hold is a tap or a swipe). */
const HOLD_MS = 220;
/** Sideways travel (pt) or speed (pt/s) that turns the month. */
const SWIPE_PT = 48;
const SWIPE_SPEED = 600;
const SETTLE_MS = tokens.motion.duration.fast;

export interface DragHandlers {
  readonly begin: (date: string) => void;
  readonly move: (date: string) => void;
  readonly end: () => void;
}

export interface DayGridProps {
  /** Weeks of seven dates (`YYYY-MM-DD`), blanks as null. */
  readonly weeks: readonly (readonly (string | null)[])[];
  readonly renderDay: (date: string) => ReactNode;
  readonly onDrag?: DragHandlers | undefined;
  /** 1 for the next month, -1 for the previous. */
  readonly onSwipe?: ((step: 1 | -1) => void) | undefined;
  readonly testID?: string | undefined;
}

export function DayGrid({ weeks, renderDay, onDrag, onSwipe, testID }: DayGridProps) {
  const theme = usePremiumTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  // The cell (row × 7 + column) the drag is over, kept on the UI thread so a day is reported once.
  const over = useSharedValue(-1);
  const shift = useSharedValue(0);
  const { width, height } = size;
  const rows = weeks.length;
  const slot = { flex: 1, padding: theme.space.gap4 / 2 };

  const cellAt = (x: number, y: number): number => {
    'worklet';
    if (width <= 0 || height <= 0 || rows === 0) return -1;
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y / (height / rows))));
    const column = Math.min(COLUMNS - 1, Math.max(0, Math.floor(x / (width / COLUMNS))));
    return row * COLUMNS + column;
  };
  const dateOf = (cell: number) => weeks[Math.floor(cell / COLUMNS)]?.[cell % COLUMNS] ?? null;
  const begin = (cell: number) => {
    const date = dateOf(cell);
    if (date === null || onDrag === undefined) return;
    impact('tick');
    onDrag.begin(date);
  };
  const move = (cell: number) => {
    const date = dateOf(cell);
    if (date === null || onDrag === undefined) return;
    impact('tick');
    onDrag.move(date);
  };
  const end = () => onDrag?.end();
  const swipe = (step: 1 | -1) => onSwipe?.(step);

  const drag = Gesture.Pan()
    .enabled(onDrag !== undefined && width > 0)
    .activateAfterLongPress(HOLD_MS)
    .onStart((event) => {
      'worklet';
      const cell = cellAt(event.x, event.y);
      over.value = cell;
      if (cell >= 0) scheduleOnRN(begin, cell);
    })
    .onUpdate((event) => {
      'worklet';
      const cell = cellAt(event.x, event.y);
      if (cell < 0 || cell === over.value) return;
      over.value = cell;
      scheduleOnRN(move, cell);
    })
    .onEnd(() => {
      'worklet';
      over.value = -1;
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
      shift.value = withTiming(0, { duration: SETTLE_MS });
      const far = Math.abs(event.translationX) >= SWIPE_PT;
      const fast = Math.abs(event.velocityX) >= SWIPE_SPEED;
      if (far || fast) scheduleOnRN(swipe, event.translationX < 0 ? 1 : -1);
    });
  const shiftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }] }));

  return (
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
          <View key={`r${row}`} style={{ flexDirection: 'row' }}>
            {week.map((date, column) =>
              date === null ? (
                <View key={row * COLUMNS + column} style={slot} />
              ) : (
                <View key={date} style={slot}>
                  {renderDay(date)}
                </View>
              ),
            )}
          </View>
        ))}
      </Animated.View>
    </GestureDetector>
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
