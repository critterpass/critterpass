/**
 * The day picker for a day trip: the days of the stop it leaves from as chips, what picking each
 * means (little is left of an arrival or leaving day, a booking stays, how many stops go back to
 * Ideas), then the confirm.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { DayChips, type DayChip } from '@/ui/planning/day-chips';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { PickerDay } from './area-model';
import * as copy from './copy';

export interface DayPickerSheetProps {
  readonly areaName: string;
  readonly chips: readonly DayChip[];
  readonly days: readonly PickerDay[];
  readonly selectedDayNo: number | null;
  readonly onSelect: (dayNo: number) => void;
  readonly sending: boolean;
  readonly onConfirm: () => void;
  readonly onDismiss: () => void;
}

const useStyles = makeStyles((t) => ({
  body: { gap: t.space['16'], paddingBottom: t.space['8'] },
  lines: { gap: t.space['6'], minHeight: 44 },
}));

export function DayPickerSheet(props: DayPickerSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const day = props.days.find((one) => one.dayNo === props.selectedDayNo) ?? null;
  return (
    <Sheet
      title={copy.pickerTitle(props.areaName)}
      detents={['fit']}
      onDismiss={props.onDismiss}
      testID="day-trip-picker"
    >
      <View style={styles.body}>
        <DayChips
          days={props.chips}
          selectedDayNo={props.selectedDayNo}
          onSelect={props.onSelect}
          selectedFill="paper"
          testID="day-trip-picker-days"
        />
        <View style={styles.lines} testID="day-trip-picker-lines">
          {day === null ? (
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {copy.pickDayHint()}
            </Text>
          ) : (
            <>
              <Text variant="body">{copy.movesLine(day.moves)}</Text>
              {day.edge === null ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {copy.edgeDayLine(day.edge === 'first')}
                </Text>
              )}
              {day.booked ? (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {copy.bookedLine()}
                </Text>
              ) : null}
              {day.otherArea === null || day.otherArea === '' ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary}>
                  {copy.otherTripLine(day.otherArea)}
                </Text>
              )}
            </>
          )}
        </View>
        <PillButton
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
    </Sheet>
  );
}
