/**
 * The days as chips (4.25 at peek 52×54, 4.26 at half 46×48): weekday over the day of the month,
 * an underline in the day's colour, the chosen day filled ink. Tapping one swaps the day (its route
 * traces out from the stay). Scrolls sideways, bleeding past the edge: `bleed` is the parent's side
 * padding, which the row reaches through so a scrolled chip runs to the screen's edge instead of
 * being cut at the padding, while the first and last chips still rest on the parent's inset.
 */
import { View } from 'react-native';

import { makePremiumStyles, PressableScale, ScrollRow, Text } from '@/ui/premium';

import { dayColours } from '../map';

/** A day as a chip (the shape `dayChips` in the trip map's copy gives). */
export interface DayChipModel {
  readonly dayNo: number;
  readonly weekday: string;
  readonly dateLabel?: string | undefined;
  readonly accessibilityLabel: string;
}

export interface DayChipsProps {
  readonly chips: readonly DayChipModel[];
  readonly chosen: number | null;
  readonly size: 'large' | 'small';
  readonly onChoose: (dayNo: number) => void;
  /** The parent's side padding the row bleeds through (0 when it already runs edge to edge). */
  readonly bleed?: number;
}

const useStyles = makePremiumStyles((t) => ({
  // The row's content runs the scroller's whole width: a sideways scroller clips its content's
  // box, so a lone chip's shadow ended in a straight line just past it.
  row: { flexGrow: 1, alignItems: 'flex-start' },
  chip: {
    borderRadius: t.radius.field,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
  },
  chosen: { backgroundColor: t.color.inkSurface },
  underline: { position: 'absolute', bottom: 5, width: 18, height: 3, borderRadius: 2 },
  weekday: { opacity: 0.7 },
}));

export function DayChips({ chips, chosen, size, onChoose, bleed = 0 }: DayChipsProps) {
  const styles = useStyles();
  const box = size === 'large' ? { width: 52, height: 54 } : { width: 46, height: 48 };
  return (
    <ScrollRow gap={8} bleed={bleed} contentContainerStyle={styles.row}>
      {chips.map((chip) => {
        const on = chip.dayNo === chosen;
        return (
          <PressableScale
            key={chip.dayNo}
            onPress={() => onChoose(chip.dayNo)}
            accessibilityRole="button"
            accessibilityLabel={chip.accessibilityLabel}
            accessibilityState={{ selected: on }}
            testID={`day-chip-${String(chip.dayNo)}`}
            style={[styles.chip, box, on ? styles.chosen : null]}
          >
            <Text
              variant="dayBadgeWeekday"
              tone={on ? 'onInk' : 'ink'}
              style={styles.weekday}
              numberOfLines={1}
            >
              {chip.weekday}
            </Text>
            <Text variant="dayBadgeDay" tone={on ? 'onInk' : 'ink'} numberOfLines={1}>
              {chip.dateLabel ?? String(chip.dayNo)}
            </Text>
            <View style={[styles.underline, { backgroundColor: dayColours(chip.dayNo).fill }]} />
          </PressableScale>
        );
      })}
    </ScrollRow>
  );
}
