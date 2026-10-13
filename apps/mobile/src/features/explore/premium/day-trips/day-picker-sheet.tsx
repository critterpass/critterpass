/**
 * The day picker for a day trip in the premium look (undesigned in the premium set; built from
 * the kit's sheet, chips and button): the days of the stop it leaves from, what picking each means
 * (little is left of an arrival or leaving day, a booking stays, how many stops go back to Ideas),
 * then the confirm.
 */
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { PremiumSheet } from '@/features/album';
import { Button, PressableScale, Text, makePremiumStyles } from '@/ui/premium';

import type { PickerDay } from '../../day-trips/area-model';
import * as copy from '../../day-trips/copy';

/** A day as a chip: weekday over the day of the month, or the day number over the weekday. */
export interface DayChoice {
  readonly dayNo: number;
  readonly weekday: string;
  readonly dateLabel?: string | undefined;
  readonly accessibilityLabel: string;
}

export interface DayPickerSheetProps {
  readonly areaName: string;
  readonly chips: readonly DayChoice[];
  readonly days: readonly PickerDay[];
  readonly selectedDayNo: number | null;
  readonly onSelect: (dayNo: number) => void;
  readonly sending: boolean;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

const useStyles = makePremiumStyles((th) => ({
  chips: { gap: th.space.gap8, paddingEnd: th.space.gap16 },
  chip: {
    width: 52,
    height: 54,
    borderRadius: th.radius.field,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.control,
  },
  chosen: { backgroundColor: th.color.inkSurface },
  lines: { gap: th.space.gap6, minHeight: 44 },
}));

export function PremiumDayPickerSheet(props: DayPickerSheetProps) {
  const styles = useStyles();
  const { t } = useLingui();
  const day = props.days.find((one) => one.dayNo === props.selectedDayNo) ?? null;
  return (
    <PremiumSheet
      title={copy.pickerTitle(props.areaName)}
      onClose={props.onDismiss}
      testID="day-trip-picker"
    >
      <View style={{ gap: 16 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          testID="day-trip-picker-days"
        >
          {props.chips.map((chip) => {
            const on = chip.dayNo === props.selectedDayNo;
            const tone = on ? 'onInk' : 'ink';
            return (
              <PressableScale
                key={chip.dayNo}
                onPress={() => props.onSelect(chip.dayNo)}
                accessibilityRole="button"
                accessibilityLabel={chip.accessibilityLabel}
                accessibilityState={{ selected: on }}
                testID={`day-chip-${String(chip.dayNo)}`}
                style={[styles.chip, on ? styles.chosen : null]}
              >
                <Text variant="badge" tone={tone}>
                  {chip.dateLabel === undefined ? String(chip.dayNo) : chip.weekday}
                </Text>
                <Text variant="headline" tone={tone}>
                  {chip.dateLabel ?? chip.weekday}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
        <View style={styles.lines} testID="day-trip-picker-lines">
          {day === null ? (
            <Text variant="rowText" tone="muted">
              {copy.pickDayHint()}
            </Text>
          ) : (
            <>
              <Text variant="body">{copy.movesLine(day.moves)}</Text>
              {day.edge === null ? null : (
                <Text variant="rowText" tone="muted">
                  {copy.edgeDayLine(day.edge === 'first')}
                </Text>
              )}
              {day.booked ? (
                <Text variant="rowText" tone="muted">
                  {copy.bookedLine()}
                </Text>
              ) : null}
              {day.otherArea === null || day.otherArea === '' ? null : (
                <Text variant="rowText" tone="muted">
                  {copy.otherTripLine(day.otherArea)}
                </Text>
              )}
            </>
          )}
        </View>
        <Button
          label={
            day === null
              ? t({ id: 'explore.dayTrips.confirmNone', message: 'Add the day trip' })
              : copy.confirmAdd(day.dayNo)
          }
          onPress={props.onConfirm}
          disabled={day === null}
          loading={props.sending}
          testID="day-trip-picker-confirm"
        />
      </View>
    </PremiumSheet>
  );
}
