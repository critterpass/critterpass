/**
 * The trip's days as a row of chips (7a-1, 7b-1, 7f-1, 7f-2): the weekday over the date (the day
 * number over its weekday for a caller that passes no date) and a short underline in the day's
 * colour; today carries a dot under it; the chosen day is filled (in its colour, or paper on the
 * add sheet) with a ring; a dot in the corner says how well a place fits that day (green, orange,
 * grey). While something is dragged over the row, the day under it glows: the drag itself belongs
 * to the screen, which passes the day it is over.
 */
import { tokens } from '@cp/design-tokens';
import { ScrollView, View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { fitDotColor, type FitGrade } from './fit-tone';

export interface DayChip {
  readonly dayNo: number;
  /** Short weekday, already localised ("Wed"). */
  readonly weekday: string;
  /** The day of the month ("17"). With it the chip reads weekday over date, the way people name
   * a day; without it, the day number over the weekday. */
  readonly dateLabel?: string | undefined;
  /** Today on the trip's clock: marked with a dot. */
  readonly today?: boolean | undefined;
  readonly color: string;
  readonly fit?: FitGrade | undefined;
  /** Screen-reader words for the day, e.g. "Wednesday 14 October". */
  readonly accessibilityLabel: string;
}

export interface DayChipsProps {
  readonly days: readonly DayChip[];
  readonly selectedDayNo?: number | null | undefined;
  readonly onSelect?: ((dayNo: number) => void) | undefined;
  /** The chosen chip's fill: the day's colour (trip map) or paper (Add to plan, 7f-1). */
  readonly selectedFill?: 'day' | 'paper' | undefined;
  /**
   * The tile under each day: `raised` on a page, `control` on a raised sheet (the trip map's), so
   * each day still sits on its own tile. Defaults to `control` with a paper fill.
   */
  readonly tile?: 'raised' | 'control' | undefined;
  /** A drag is over the row: every chip shows it can take the drop, this one glows. */
  readonly dropTarget?: { readonly overDayNo: number | null } | undefined;
  readonly testID?: string | undefined;
}

/** Up to this many days share the row's width; more scroll sideways. */
const FIT_IN_ROW = 8;
const CHIP_HEIGHT = 50;
const MIN_CHIP_WIDTH = 40;

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['6'] },
  scroll: { gap: t.space['6'] },
  slot: { flex: 1, minWidth: MIN_CHIP_WIDTH },
  slotScrolling: { width: 44 },
  chip: {
    height: CHIP_HEIGHT,
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ring: { borderColor: t.color.paper.base },
  droppable: { borderColor: t.semantic.border.decorative, borderStyle: 'dashed' },
  glow: { borderColor: t.semantic.action.primary, borderStyle: 'solid' },
  underline: { width: 14, height: 3, borderRadius: 2, marginTop: t.space['2'] },
  today: {
    position: 'absolute',
    top: t.space['4'],
    start: t.space['4'],
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dot: {
    position: 'absolute',
    top: t.space['4'],
    end: t.space['4'],
    width: 7,
    height: 7,
    borderRadius: 4,
  },
}));

const LIGHT_FILLS: ReadonlySet<string> = new Set([
  tokens.color.yellow,
  tokens.color.paper.base,
  tokens.color.green.base,
  tokens.color.orange,
]);

export function DayChips({
  days,
  selectedDayNo = null,
  onSelect,
  selectedFill = 'day',
  tile: tileTone,
  dropTarget,
  testID = 'day-chips',
}: DayChipsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const scrolls = days.length > FIT_IN_ROW;

  const chips = days.map((day) => {
    const selected = day.dayNo === selectedDayNo;
    const over = dropTarget?.overDayNo === day.dayNo;
    // On a sheet (Add to plan) the panel is already raised: each day sits on its own darker tile.
    const onSheet = (tileTone ?? (selectedFill === 'paper' ? 'control' : 'raised')) === 'control';
    const tile = onSheet ? theme.semantic.bg.control : theme.semantic.bg.raised;
    const fill = selected ? (selectedFill === 'paper' ? theme.color.paper.base : day.color) : tile;
    // A light day colour (yellow, paper, green, orange) takes dark ink, as paper does.
    const ink =
      selected && LIGHT_FILLS.has(fill) ? theme.color.paper.ink : theme.semantic.text.primary;
    return (
      <PressScale
        key={day.dayNo}
        widthClass="narrow"
        accessibilityRole="button"
        accessibilityLabel={day.accessibilityLabel}
        accessibilityState={{ selected }}
        onPress={onSelect === undefined ? undefined : () => onSelect(day.dayNo)}
        style={scrolls ? styles.slotScrolling : styles.slot}
        testID={`${testID}-${String(day.dayNo)}`}
      >
        <View
          style={[
            styles.chip,
            { backgroundColor: fill },
            selected ? styles.ring : null,
            dropTarget === undefined ? null : over ? styles.glow : styles.droppable,
          ]}
        >
          {day.dateLabel === undefined ? (
            <>
              <Text variant="title" color={ink}>
                {String(day.dayNo)}
              </Text>
              <Text
                variant="label"
                color={selected ? ink : theme.semantic.text.secondary}
                singleLine
                numberOfLines={1}
              >
                {day.weekday}
              </Text>
            </>
          ) : (
            <>
              <Text
                variant="label"
                color={selected ? ink : theme.semantic.text.secondary}
                singleLine
                numberOfLines={1}
              >
                {day.weekday}
              </Text>
              <Text variant="title" color={ink}>
                {day.dateLabel}
              </Text>
            </>
          )}
          {selected ? null : <View style={[styles.underline, { backgroundColor: day.color }]} />}
          {day.today === true ? (
            <View style={[styles.today, { backgroundColor: selected ? ink : day.color }]} />
          ) : null}
          {day.fit === undefined ? null : (
            <View style={[styles.dot, { backgroundColor: fitDotColor(theme, day.fit) }]} />
          )}
        </View>
      </PressScale>
    );
  });

  if (!scrolls) {
    return (
      <View style={styles.row} testID={testID}>
        {chips}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      testID={testID}
    >
      {chips}
    </ScrollView>
  );
}
